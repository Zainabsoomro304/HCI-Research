"""Learning curves (RQ1) and starting points (RQ2, RQ3), with leave-one-out for every participant."""

from __future__ import annotations

import warnings
import zlib
from dataclasses import dataclass

import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from sklearn.exceptions import ConvergenceWarning
from sklearn.neural_network import MLPClassifier

from hci.config import Config
from hci.loo import build_shared, make_split, select_sigma_nested, split_rng, start_weights
from hci.model import Comparisons, by_participant, estimate_nuisance, fit_map, predict_left, use_curvature

STARTS = ("scratch", "global", "cluster_choice", "cluster_questionnaire")
CENSORED = float("inf")


@dataclass(frozen=True)
class PersonResult:
    code: str
    rows: pd.DataFrame
    mlp_rows: pd.DataFrame
    meta: dict


def k90(accuracy_by_k: dict[int, float], ceiling: float, fraction: float = 0.9) -> float:
    """The smallest k reaching `fraction` of the ceiling. CENSORED (inf) means not reached: ">50", never 50."""
    target = fraction * ceiling
    for k in sorted(accuracy_by_k):
        if accuracy_by_k[k] >= target:
            return float(k)
    return CENSORED


def corrected_ceiling(consistency: float) -> float:
    """Best possible accuracy implied by test-retest agreement.

    Agreement between two independent draws is c = p^2 + (1 - p)^2, where p is how often a person picks their more
    likely option. A perfect model predicts that option and is right p of the time, so p = (1 + sqrt(2c - 1)) / 2.
    A person who repeats 70% of their choices has p of about 0.82: a model can legitimately beat test-retest agreement.
    Below c = 0.5 the formula is undefined and p is taken as 0.5.
    """
    if np.isnan(consistency):
        return float("nan")
    return float((1 + np.sqrt(max(2 * consistency - 1, 0.0))) / 2)


def not_meaningful(ceiling: float, fraction: float = 0.9) -> bool:
    """True when the k90 target is at or below chance, so that reaching it says nothing about the model."""
    return bool(np.isnan(ceiling) or fraction * ceiling <= 0.5)


def _mlp_accuracy(train: Comparisons, test: Comparisons, config: Config, seed: int) -> float:
    if len(set(train.y)) < 2:  # with very few comparisons one person can pick all-left: predict that side
        return float((test.y == train.y[0]).mean())
    settings = config.phase2.mlp
    model = MLPClassifier(
        hidden_layer_sizes=tuple(settings.hidden),
        alpha=settings.alpha,
        solver="lbfgs",
        max_iter=settings.max_iter,
        random_state=seed,
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", ConvergenceWarning)
        model.fit(train.dx, train.y)
    return float((model.predict(test.dx) == test.y).mean())


def _analyse_person(
    code: str,
    people: dict[str, Comparisons],
    answers: dict[str, np.ndarray],
    pairs: list[str],
    trial_index: np.ndarray,
    curvature: bool,
    config: Config,
) -> PersonResult:
    settings = config.phase2
    others = {c: d for c, d in people.items() if c != code}
    others_answers = {c: a for c, a in answers.items() if c != code}
    seed = zlib.crc32(code.encode()) % 2**31
    nuisance = estimate_nuisance(
        [others[c] for c in sorted(others)],
        sigma=config.model.nuisance_sigma,
        rounds=config.model.nuisance_rounds,
        use_curvature=curvature,
    )
    sigma, _ = select_sigma_nested(others, others_answers, nuisance=nuisance, config=config, seed=config.seeds.cv_folds)
    shared = build_shared(
        others, others_answers, sigma=sigma, nuisance=nuisance, config=config, seed=config.seeds.clustering
    )
    data = people[code]
    pairs_array = np.array(pairs)
    records: list[pd.DataFrame] = []
    mlp_records: list[dict] = []
    for split in range(settings.n_splits):
        test, pool = make_split(len(data), settings.n_test, split_rng(config.seeds.learning_curve, code, split))
        held_test, train = data.take(test), data.take(pool)
        for (start, k), (w, cluster) in start_weights(train, answers[code], shared, settings.k_values).items():
            correct = (predict_left(held_test, w, nuisance) >= 0.5) == (held_test.y == 1)
            records.append(
                pd.DataFrame(
                    {
                        "participant": code,
                        "split": split,
                        "start": start,
                        "k": k,
                        "cluster": -1 if cluster is None else cluster,
                        "trial_index": trial_index[test],
                        "test_pair": pairs_array[test],
                        "correct": correct.astype(int),
                    }
                )
            )
        for k in settings.k_values:
            first = train.first(k)
            logistic = fit_map(first, sigma=sigma, nuisance=nuisance)
            logistic_accuracy = float(
                ((predict_left(held_test, logistic, nuisance) >= 0.5) == (held_test.y == 1)).mean()
            )
            mlp_records.append(
                {
                    "participant": code,
                    "split": split,
                    "k": k,
                    "logistic": logistic_accuracy,
                    "mlp": _mlp_accuracy(first, held_test, config, config.seeds.mlp + seed % 1000 + split),
                }
            )
    meta = {
        "participant": code,
        "sigma": sigma,
        "beta_side": nuisance.beta_side,
        "kappa": nuisance.kappa,
        "k_clusters": shared.choice.k,
        "silhouette": shared.choice.silhouette,
    }
    return PersonResult(code, pd.concat(records, ignore_index=True), pd.DataFrame(mlp_records), meta)


@dataclass(frozen=True)
class LearningResults:
    rows: pd.DataFrame
    mlp: pd.DataFrame
    meta: pd.DataFrame


def run_learning_curves(main: pd.DataFrame, answers: dict[str, np.ndarray], config: Config) -> LearningResults:
    """main: answered main trials in chronological order. Runs one leave-one-out analysis per participant."""
    people = by_participant(main)
    needed = config.phase2.n_test + max(config.phase2.k_values)
    short = {c: len(d) for c, d in people.items() if len(d) < needed}
    if short:
        raise ValueError(f"Learning curves need at least {needed} main trials per participant. Too few: {short}")
    pairs: dict[str, list[str]] = {}
    trial_index: dict[str, np.ndarray] = {}
    for code, group in main.groupby("participant_code", sort=True):
        left, right = group["left_clip_id"].astype(str), group["right_clip_id"].astype(str)
        pairs[str(code)] = ["|".join(sorted(p)) for p in zip(left, right, strict=True)]
        trial_index[str(code)] = group["trial_index"].to_numpy(int)
    curvature = use_curvature(config.model.curvature, config.model.curvature_max_vif)
    results = Parallel(n_jobs=config.phase2.n_jobs)(
        delayed(_analyse_person)(code, people, answers, pairs[code], trial_index[code], curvature, config)
        for code in sorted(people)
    )
    return LearningResults(
        rows=pd.concat([r.rows for r in results], ignore_index=True),
        mlp=pd.concat([r.mlp_rows for r in results], ignore_index=True),
        meta=pd.DataFrame([r.meta for r in results]),
    )


def per_person_curves(rows: pd.DataFrame) -> pd.DataFrame:
    """Mean accuracy per participant, starting point and k, averaged over the test splits."""
    return (
        rows.groupby(["participant", "start", "k"], as_index=False)["correct"]
        .mean()
        .rename(columns={"correct": "accuracy"})
    )


def person_k90(curves: pd.DataFrame, ceilings: pd.Series, fraction: float) -> pd.DataFrame:
    """One row per participant and starting point. ceilings: participant -> ceiling."""
    records = []
    for (participant, start), group in curves.groupby(["participant", "start"]):
        ceiling = float(ceilings.loc[participant])
        records.append(
            {
                "participant": participant,
                "start": start,
                "ceiling": ceiling,
                "k90": k90(dict(zip(group["k"], group["accuracy"], strict=True)), ceiling, fraction),
                "not_meaningful": not_meaningful(ceiling, fraction),
            }
        )
    return pd.DataFrame(records)


def bootstrap_mean_ci(values: np.ndarray, rng: np.random.Generator, n: int, level: float = 0.95) -> tuple[float, float]:
    sample = rng.integers(0, len(values), size=(n, len(values)))
    means = values[sample].mean(axis=1)
    return float(np.quantile(means, (1 - level) / 2)), float(np.quantile(means, 1 - (1 - level) / 2))


def censored_median(values: np.ndarray) -> float:
    """Median with censored (inf) values kept at the top: inf when at least half are censored."""
    ordered = np.sort(values)
    n = len(ordered)
    if n == 0:
        return float("nan")
    if n % 2:
        return float(ordered[n // 2])
    low, high = ordered[n // 2 - 1], ordered[n // 2]
    return CENSORED if np.isinf(high) else float((low + high) / 2)


def bootstrap_median_ci(values: np.ndarray, rng: np.random.Generator, n: int) -> tuple[float, float]:
    draws = np.array([censored_median(values[rng.integers(0, len(values), len(values))]) for _ in range(n)])
    return float(np.quantile(draws, 0.025, method="lower")), float(np.quantile(draws, 0.975, method="higher"))


def format_k(value: float) -> str:
    return ">50" if np.isinf(value) else ("n/a" if np.isnan(value) else f"{value:g}")
