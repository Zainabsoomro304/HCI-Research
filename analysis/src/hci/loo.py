"""Leave-one-out shared models: everything a held-out person starts from, built without that person.

`build_shared` receives only the other participants, so the held-out person cannot influence their own nuisance terms,
sigma, global model or clusters. `select_sigma_nested` tunes sigma the same way, inside the others.
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import KMeans

from hci.clustering import ChoiceClusters, assign_by_likelihood, fit_choice_clusters
from hci.config import Config
from hci.model import Comparisons, Nuisance, fit_map, fit_pooled, log_likelihood


@dataclass(frozen=True)
class SharedModels:
    nuisance: Nuisance
    sigma: float
    global_w: np.ndarray
    choice: ChoiceClusters
    questionnaire_centroids: np.ndarray | None
    questionnaire_weights: np.ndarray | None

    def questionnaire_cluster(self, answers: np.ndarray) -> int:
        if self.questionnaire_centroids is None:
            raise ValueError("These shared models were built without questionnaire clusters")
        return int(np.argmin(((self.questionnaire_centroids - answers) ** 2).sum(axis=1)))


def build_shared(
    others: dict[str, Comparisons],
    others_answers: dict[str, np.ndarray] | None,
    *,
    sigma: float,
    nuisance: Nuisance,
    config: Config,
    seed: int,
) -> SharedModels:
    """Questionnaire clusters use the same number of clusters as the choice-based ones, for a fair comparison."""
    codes = sorted(others)
    parts = [others[c] for c in codes]
    sigma_pool = config.model.sigma_pool
    global_w = fit_pooled(parts, sigma_pool=sigma_pool, nuisance=nuisance)
    scratch = np.array([fit_map(p, sigma=sigma, nuisance=nuisance) for p in parts])
    choice = fit_choice_clusters(
        scratch,
        parts,
        candidates=config.clusters.candidates,
        seed=seed,
        n_init=config.clusters.kmeans_n_init,
        sigma_pool=sigma_pool,
        nuisance=nuisance,
    )
    centroids, weights = None, None
    if others_answers is not None:
        points = np.array([others_answers[c] for c in codes])
        km = KMeans(n_clusters=choice.k, n_init=config.clusters.kmeans_n_init, random_state=seed).fit(points)
        centroids = km.cluster_centers_
        weights = np.array(
            [
                fit_pooled(
                    [p for p, label in zip(parts, km.labels_, strict=True) if label == cluster],
                    sigma_pool=sigma_pool,
                    nuisance=nuisance,
                )
                for cluster in range(choice.k)
            ]
        )
    return SharedModels(nuisance, sigma, global_w, choice, centroids, weights)


def split_rng(seed: int, code: str, split: int) -> np.random.Generator:
    """Depends only on the seed, the participant and the split, never on who else is in the data or the run order."""
    return np.random.default_rng([seed, zlib.crc32(code.encode()), split])


def make_split(n_main: int, n_test: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Returns (test indices, training pool). The pool stays in chronological order."""
    test = np.sort(rng.choice(n_main, size=n_test, replace=False))
    return test, np.setdiff1d(np.arange(n_main), test)


def start_weights(
    train: Comparisons, answers: np.ndarray | None, shared: SharedModels, ks: list[int]
) -> dict[tuple[str, int], tuple[np.ndarray, int | None]]:
    """Weights per (starting point, k), with the assigned cluster where there is one. `train` is chronological.

    cluster_choice is assigned from the first k training comparisons only. cluster_questionnaire is assigned from
    answers only, so it exists at k = 0, as does global. Scratch and cluster_choice have nothing to use at k = 0.
    """
    sigma, nuisance = shared.sigma, shared.nuisance
    out: dict[tuple[str, int], tuple[np.ndarray, int | None]] = {("global", 0): (shared.global_w, None)}
    q_cluster = None
    if answers is not None:
        q_cluster = shared.questionnaire_cluster(answers)
        out[("cluster_questionnaire", 0)] = (shared.questionnaire_weights[q_cluster], q_cluster)
    for k in ks:
        first = train.first(k)
        out[("scratch", k)] = (fit_map(first, sigma=sigma, nuisance=nuisance), None)
        out[("global", k)] = (fit_map(first, mu=shared.global_w, sigma=sigma, nuisance=nuisance), None)
        assigned = assign_by_likelihood(first, shared.choice.weights, nuisance)
        out[("cluster_choice", k)] = (
            fit_map(first, mu=shared.choice.weights[assigned], sigma=sigma, nuisance=nuisance),
            assigned,
        )
        if q_cluster is not None:
            out[("cluster_questionnaire", k)] = (
                fit_map(first, mu=shared.questionnaire_weights[q_cluster], sigma=sigma, nuisance=nuisance),
                q_cluster,
            )
    return out


def select_sigma_nested(
    others: dict[str, Comparisons],
    others_answers: dict[str, np.ndarray] | None,
    *,
    nuisance: Nuisance,
    config: Config,
    seed: int,
) -> tuple[float, dict[float, float]]:
    """One sigma for all starting points: the lowest held-out log-loss, averaged over every starting point and k.

    Runs entirely inside the participants it is given. They are split into folds; each fold is treated as new users,
    with shared models built from the remaining folds, and tested on a random 20 trials of each person.
    """
    settings = config.phase2
    codes = sorted(others)
    fold_of = np.random.default_rng(seed).permutation(len(codes)) % settings.sigma_inner_folds
    losses: dict[float, float] = {}
    for sigma in config.model.sigma_grid:
        total, count = 0.0, 0
        for fold in range(settings.sigma_inner_folds):
            held = [c for c, f in zip(codes, fold_of, strict=True) if f == fold]
            rest = {c: others[c] for c, f in zip(codes, fold_of, strict=True) if f != fold}
            rest_answers = None if others_answers is None else {c: others_answers[c] for c in rest}
            shared = build_shared(rest, rest_answers, sigma=sigma, nuisance=nuisance, config=config, seed=seed)
            for code in held:
                data = others[code]
                test, pool = make_split(len(data), settings.n_test, split_rng(seed, code, 0))
                held_test = data.take(test)
                train = data.take(pool)
                answers = None if others_answers is None else others_answers[code]
                for w, _ in start_weights(train, answers, shared, settings.k_values).values():
                    total -= log_likelihood(held_test, w, nuisance)
                    count += len(held_test)
        losses[sigma] = total / count
    return min(losses, key=lambda s: (losses[s], s)), losses
