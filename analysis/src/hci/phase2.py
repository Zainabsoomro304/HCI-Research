"""Phase 2 analysis: self-consistency and fatigue, learning curves, starting points, clusters and CS / non-CS descriptives."""

from __future__ import annotations

import json
from dataclasses import dataclass
from itertools import combinations
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score
from statsmodels.stats.multitest import multipletests

from hci import figures
from hci.clean import CleanData, clean
from hci.clustering import fit_choice_clusters
from hci.conditions import restricted_argmax
from hci.config import Config
from hci.encoding import FEATURES, encode
from hci.io import load_export
from hci.learning import (
    STARTS,
    LearningResults,
    bootstrap_mean_ci,
    bootstrap_median_ci,
    censored_median,
    corrected_ceiling,
    format_k,
    per_person_curves,
    person_k90,
    run_learning_curves,
)
from hci.loo import select_sigma_nested
from hci.model import Nuisance, by_participant, estimate_nuisance, fit_map, use_curvature
from hci.outputs import Report, Run, new_run, write_manifest
from hci.questionnaire import questionnaire_vectors
from hci.rstats import as_arg, r_versions, run_r, run_r_many


def _accuracy_summary(curves: pd.DataFrame, ceiling: float, config: Config) -> pd.DataFrame:
    rng = np.random.default_rng(config.seeds.bootstrap)
    records = []
    for (start, k), group in curves.groupby(["start", "k"]):
        values = group.sort_values("participant")["accuracy"].to_numpy()
        low, high = bootstrap_mean_ci(values, rng, config.phase2.bootstrap_samples)
        records.append(
            {
                "start": start,
                "k": int(k),
                "mean": values.mean(),
                "ci_low": low,
                "ci_high": high,
                "share_of_group_ceiling": values.mean() / ceiling,
            }
        )
    return pd.DataFrame(records).sort_values(["start", "k"]).reset_index(drop=True)


def _k90_summary(table: pd.DataFrame, config: Config) -> pd.DataFrame:
    rng = np.random.default_rng(config.seeds.bootstrap)
    records = []
    for start in STARTS:
        rows = table[table["start"] == start]
        usable = rows.loc[~rows["not_meaningful"], "k90"].to_numpy(float)
        low, high = (
            bootstrap_median_ci(usable, rng, config.phase2.bootstrap_samples) if len(usable) else (np.nan, np.nan)
        )
        records.append(
            {
                "start": start,
                "n_usable": len(usable),
                "median_k90": format_k(censored_median(usable)),
                "ci_low": format_k(low),
                "ci_high": format_k(high),
                "n_censored_over_50": int(np.isinf(usable).sum()),
                "n_k90_not_meaningful": int(rows["not_meaningful"].sum()),
            }
        )
    return pd.DataFrame(records)


def _pool_contrasts(frames: list[pd.DataFrame]) -> pd.DataFrame:
    """Averages estimates and SEs across test splits. Averaging the SEs rather than shrinking them is deliberate: the
    splits reuse the same responses, so they are not independent evidence. Holm is applied within each k."""
    all_rows = pd.concat(frames, ignore_index=True)
    pooled = all_rows.groupby(["k", "contrast"], as_index=False).agg(
        estimate=("estimate", "mean"), se=("se", "mean"), n_splits=("estimate", "size")
    )
    pooled["odds_ratio"] = np.exp(pooled["estimate"])
    pooled["z"] = pooled["estimate"] / pooled["se"]
    pooled["p"] = 2 * stats.norm.sf(np.abs(pooled["z"]))
    pooled["p_holm"] = np.nan
    for _, group in pooled.groupby("k"):
        pooled.loc[group.index, "p_holm"] = multipletests(group["p"], method="holm")[1]
    return pooled.sort_values(["k", "contrast"]).reset_index(drop=True)


def _fit_curve_models(
    rows: pd.DataFrame, work: Path, config: Config, *, slopes: bool, label: str
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Fits one mixed model per test split in R. k = 0 is excluded: log(k) is undefined there."""
    work.mkdir(parents=True, exist_ok=True)
    data = rows[rows["k"] > 0]
    jobs = []
    for split, group in data.groupby("split"):
        source = work / f"{label}_split_{split}.csv"
        group[["participant", "start", "k", "test_pair", "correct"]].to_csv(source, index=False, lineterminator="\n")
        jobs.append((as_arg(source), as_arg(work / f"{label}_result_{split}.csv"), "1" if slopes else "0"))
    run_r_many("curve_glmm.R", jobs, config.phase2.r_workers)
    results = [pd.read_csv(job[1], keep_default_na=False) for job in jobs]
    status = {
        "splits": len(results),
        "singular_fits": int(sum(str(r["singular"].iloc[0]).upper() == "TRUE" for r in results)),
        "fits_with_warnings": int(sum(bool(str(r["warnings"].iloc[0]).strip()) for r in results)),
        "warnings": sorted({str(r["warnings"].iloc[0]).strip() for r in results if str(r["warnings"].iloc[0]).strip()})[
            :5
        ],
    }
    for result in results:
        result["estimate"] = result["estimate"].astype(float)
        result["se"] = result["se"].astype(float)
    return _pool_contrasts(results), status


def _zero_baselines(curves: pd.DataFrame, config: Config) -> pd.DataFrame:
    """k = 0: no comparisons at all. Paired by participant, so tested with a participant bootstrap, not the k > 0 model."""
    rng = np.random.default_rng(config.seeds.bootstrap)
    zero = curves[curves["k"] == 0].pivot(index="participant", columns="start", values="accuracy").sort_index()
    records = []
    for start in zero.columns:
        low, high = bootstrap_mean_ci(zero[start].to_numpy(), rng, config.phase2.bootstrap_samples)
        records.append(
            {"comparison": f"{start} accuracy", "estimate": zero[start].mean(), "ci_low": low, "ci_high": high}
        )
    for a, b in combinations(zero.columns, 2):
        difference = (zero[a] - zero[b]).to_numpy()
        low, high = bootstrap_mean_ci(difference, rng, config.phase2.bootstrap_samples)
        records.append({"comparison": f"{a} - {b}", "estimate": difference.mean(), "ci_low": low, "ci_high": high})
    return pd.DataFrame(records)


@dataclass
class ClusterDescription:
    k: int
    labels: pd.Series
    weights: np.ndarray
    silhouette: float
    stability_ari: float
    stability_low: float
    stability_high: float
    scratch: pd.DataFrame
    sigma: float
    nuisance: Nuisance


def _describe_clusters(data: CleanData, answers: dict[str, np.ndarray], config: Config) -> ClusterDescription:
    """All eligible participants together. Descriptive only: predictions always use the leave-one-out versions."""
    people = by_participant(data.main)
    codes = sorted(people)
    parts = [people[c] for c in codes]
    nuisance = estimate_nuisance(
        parts,
        sigma=config.model.nuisance_sigma,
        rounds=config.model.nuisance_rounds,
        use_curvature=use_curvature(config.model.curvature, config.model.curvature_max_vif),
    )
    sigma, _ = select_sigma_nested(people, answers, nuisance=nuisance, config=config, seed=config.seeds.cv_folds)
    scratch = np.array([fit_map(p, sigma=sigma, nuisance=nuisance) for p in parts])
    clusters = fit_choice_clusters(
        scratch,
        parts,
        candidates=config.clusters.candidates,
        seed=config.seeds.clustering,
        n_init=config.clusters.kmeans_n_init,
        sigma_pool=config.model.sigma_pool,
        nuisance=nuisance,
    )
    rng = np.random.default_rng(config.seeds.bootstrap)
    aris = []
    for _ in range(config.phase2.cluster_stability_samples):
        sample = rng.integers(0, len(scratch), len(scratch))
        if len(np.unique(scratch[sample], axis=0)) < clusters.k:
            continue
        model = KMeans(n_clusters=clusters.k, n_init=5, random_state=config.seeds.clustering).fit(scratch[sample])
        aris.append(adjusted_rand_score(clusters.labels, model.predict(scratch)))
    return ClusterDescription(
        k=clusters.k,
        labels=pd.Series(clusters.labels, index=codes),
        weights=clusters.weights,
        silhouette=clusters.silhouette,
        stability_ari=float(np.mean(aris)),
        stability_low=float(np.quantile(aris, 0.025)),
        stability_high=float(np.quantile(aris, 0.975)),
        scratch=pd.DataFrame(scratch, index=codes, columns=list(FEATURES)),
        sigma=sigma,
        nuisance=nuisance,
    )


def _gamma_sensitivity(scratch: pd.DataFrame, config: Config) -> pd.DataFrame:
    """Linear busyness is not identifiable. If a share gamma of every weight were really busyness bias, a person's
    preference would be w - gamma. This reports how many personal targets that assumption would move."""
    low, high = config.targets.min_changed, config.targets.max_changed
    baseline = [restricted_argmax(w, low, high) for w in scratch.to_numpy()]
    records = []
    for gamma in config.phase2.gamma_grid:
        moved = [
            restricted_argmax(w - gamma, low, high) != b for w, b in zip(scratch.to_numpy(), baseline, strict=True)
        ]
        records.append({"gamma": gamma, "share_of_personal_targets_changed": float(np.mean(moved))})
    return pd.DataFrame(records)


def _group_tables(
    data: CleanData, curves: pd.DataFrame, k90_table: pd.DataFrame, description: ClusterDescription, config: Config
) -> dict[str, pd.DataFrame]:
    rng = np.random.default_rng(config.seeds.bootstrap)
    participants = data.participants.assign(self_consistency=data.participants["self_consistency"].astype(float))
    groups = [g for g in ("cs", "nonCs") if (participants["group"] == g).any()]
    code_group = participants.set_index("participant_code")["group"].astype(str)
    samples = config.phase2.bootstrap_samples

    consistency = []
    for group in groups:
        values = participants.loc[participants["group"] == group, "self_consistency"].dropna().to_numpy()
        low, high = bootstrap_mean_ci(values, rng, samples)
        consistency.append({"group": group, "n": len(values), "mean": values.mean(), "ci_low": low, "ci_high": high})

    weights = []
    for group in groups:
        rows = description.scratch.loc[[c for c in description.scratch.index if code_group[c] == group]]
        for feature in FEATURES:
            low, high = bootstrap_mean_ci(rows[feature].to_numpy(), rng, samples)
            weights.append(
                {"group": group, "feature": feature, "mean": rows[feature].mean(), "ci_low": low, "ci_high": high}
            )

    scratch = curves[(curves["start"] == "scratch") & (curves["k"] > 0)].assign(
        group=lambda d: d["participant"].map(code_group)
    )
    curve_rows = []
    for (group, k), rows in scratch.groupby(["group", "k"]):
        if group not in groups:
            continue
        low, high = bootstrap_mean_ci(rows.sort_values("participant")["accuracy"].to_numpy(), rng, samples)
        curve_rows.append(
            {"group": group, "k": int(k), "mean": rows["accuracy"].mean(), "ci_low": low, "ci_high": high}
        )

    k90_groups = []
    tagged = k90_table.assign(group=k90_table["participant"].map(code_group))
    for (group, start), rows in tagged[tagged["group"].isin(groups)].groupby(["group", "start"]):
        usable = rows.loc[~rows["not_meaningful"], "k90"].to_numpy(float)
        k90_groups.append(
            {
                "group": group,
                "start": start,
                "n_usable": len(usable),
                "median_k90": format_k(censored_median(usable)),
                "n_censored_over_50": int(np.isinf(usable).sum()),
            }
        )

    labels = description.labels.rename("cluster") + 1
    crosstab = pd.crosstab(labels, labels.index.map(code_group)).reset_index()
    crosstab.columns.name = None
    return {
        "consistency": pd.DataFrame(consistency),
        "weights": pd.DataFrame(weights),
        "curves": pd.DataFrame(curve_rows),
        "k90": pd.DataFrame(k90_groups),
        "crosstab": crosstab,
    }


def _recovery_checks(
    data: CleanData, truth: dict, description: ClusterDescription, curves: pd.DataFrame, config: Config
) -> pd.DataFrame:
    """Compares this analysis with what was built into the simulation."""
    people = {p["participant_code"]: p for p in truth["participants"]}
    codes = list(description.labels.index)
    records = []

    def add(effect: str, built_in: str, recovered: str) -> None:
        records.append({"effect": effect, "built_in": built_in, "recovered": recovered})

    true_clusters = [people[c]["cluster"] for c in codes]
    add(
        "Latent clusters",
        f"{len(truth['cluster_means'])} clusters",
        f"k = {description.k}, adjusted Rand index with truth = {adjusted_rand_score(true_clusters, description.labels):.2f}",
    )
    add("Side bias (beta_side)", f"{truth['side_bias']:.2f}", f"{description.nuisance.beta_side:.2f}")
    add("Busyness curvature (kappa)", f"{truth['busy_curvature']:.2f}", f"{description.nuisance.kappa:.2f}")

    consistency = data.participants.set_index("participant_code")["self_consistency"].astype(float)
    expected = np.array([people[c]["expected_consistency"] for c in codes])
    add(
        "Person-level consistency",
        f"true range {expected.min():.2f}-{expected.max():.2f}",
        f"observed vs true r = {np.corrcoef(consistency.loc[codes], expected)[0, 1]:.2f}",
    )

    # The ideal predictor, using the true weights, tells whether the corrected ceiling is the right ceiling.
    main = data.main
    oracle = []
    for code, group in main.groupby("participant_code"):
        w = np.array(people[str(code)]["w"])
        left = np.array([encode(str(c)) for c in group["left_clip_id"]])
        right = np.array([encode(str(c)) for c in group["right_clip_id"]])
        predicted_left = (left - right) @ (w + truth["busy_gamma"]) + truth["side_bias"] >= 0
        oracle.append(float((predicted_left == (group["choice"] == "left").to_numpy()).mean()))
    mean_consistency = float(consistency.loc[codes].mean())
    add(
        "Ceiling",
        f"oracle accuracy with the true weights = {np.mean(oracle):.3f}",
        f"raw self-consistency = {mean_consistency:.3f}, corrected ceiling = {corrected_ceiling(mean_consistency):.3f}",
    )

    def accuracy(start: str, k: int) -> float:
        return float(curves[(curves["start"] == start) & (curves["k"] == k)]["accuracy"].mean())

    add(
        "Group structure helps early",
        "shared clusters exist",
        f"k = 5: cluster_choice {accuracy('cluster_choice', 5):.3f}, global {accuracy('global', 5):.3f}, scratch {accuracy('scratch', 5):.3f}",
    )
    add(
        "Starting points converge late",
        "same person, more data",
        f"k = 50: cluster_choice {accuracy('cluster_choice', 50):.3f}, global {accuracy('global', 50):.3f}, scratch {accuracy('scratch', 50):.3f}",
    )
    add(
        "Questionnaire is informative but imperfect",
        f"informativeness {config.simulate.questionnaire_informativeness:.2f}",
        f"k = 0: cluster_questionnaire {accuracy('cluster_questionnaire', 0):.3f}, global {accuracy('global', 0):.3f}; k = 5: cluster_questionnaire {accuracy('cluster_questionnaire', 5):.3f}, cluster_choice {accuracy('cluster_choice', 5):.3f}",
    )
    means = (
        data.participants.assign(c=consistency.reindex(data.participants["participant_code"]).to_numpy())
        .groupby("group")["c"]
        .mean()
    )
    add(
        "Non-CS extra lapse",
        f"{config.simulate.noncs_extra_lapse:.2f}",
        f"mean consistency: {', '.join(f'{g} {v:.2f}' for g, v in means.items())}",
    )
    add(
        "Fatigue (lapse rate at session end)",
        f"+{config.simulate.fatigue_lapse_slope:.2f}",
        "see the fatigue table: half and position effects",
    )
    return pd.DataFrame(records)


def _analyse(export_data, config: Config, *, exclude_attention: bool, work: Path, label: str) -> dict[str, Any]:
    data = clean(export_data, config, exclude_attention=exclude_attention)
    codes = data.codes()
    if len(codes) < 4:
        raise ValueError(f"Too few eligible participants for this analysis: {len(codes)}")
    answers = questionnaire_vectors(export_data.background, codes, config.study.comparison_session_types)
    results: LearningResults = run_learning_curves(data.main, answers, config)
    curves = per_person_curves(results.rows)
    raw = data.participants.set_index("participant_code")["self_consistency"].astype(float)
    corrected = raw.map(corrected_ceiling)
    fraction = config.phase2.ceiling_fraction
    k90_raw = person_k90(curves, raw, fraction)
    k90_corrected = person_k90(curves, corrected, fraction)
    contrasts, status = _fit_curve_models(results.rows, work, config, slopes=False, label=f"{label}_intercepts")
    return {
        "data": data,
        "answers": answers,
        "results": results,
        "curves": curves,
        "ceilings_raw": raw,
        "ceilings_corrected": corrected,
        "k90_raw": k90_raw,
        "k90_corrected": k90_corrected,
        "contrasts": contrasts,
        "contrast_status": status,
    }


def run_phase2(export_path: Path, config: Config, *, output_root: Path | None = None) -> Path:
    export_data = load_export(export_path)
    run: Run = new_run(
        "phase2", export_sha=export_data.sha256, config=config, synthetic=export_data.synthetic, root=output_root
    )
    work = run.directory / "work"
    work.mkdir(parents=True, exist_ok=True)

    primary = _analyse(
        export_data, config, exclude_attention=config.cleaning.exclude_attention_failures, work=work, label="primary"
    )
    data: CleanData = primary["data"]
    curves: pd.DataFrame = primary["curves"]
    rows = primary["results"].rows
    raw = primary["ceilings_raw"]
    samples = config.phase2.bootstrap_samples
    rng = np.random.default_rng(config.seeds.bootstrap)

    group_ceiling = float(raw.mean())
    low, high = bootstrap_mean_ci(raw.dropna().to_numpy(), rng, samples)
    ceiling = {"mean": group_ceiling, "low": low, "high": high, "corrected": corrected_ceiling(group_ceiling)}

    slopes, slopes_status = None, None
    if config.phase2.slopes_sensitivity:
        slopes, slopes_status = _fit_curve_models(rows, work, config, slopes=True, label="primary_slopes")

    # Fatigue models.
    data.repeats.to_csv(work / "repeats.csv", index=False, lineterminator="\n")
    position = rows[(rows["start"] == "scratch") & (rows["k"] == max(config.phase2.k_values))]
    position[["participant", "split", "trial_index", "correct"]].to_csv(
        work / "position.csv", index=False, lineterminator="\n"
    )
    data.main[["participant_code", "trial_index", "rt_ms"]].dropna().to_csv(
        work / "rt.csv", index=False, lineterminator="\n"
    )
    run_r("fatigue.R", as_arg(work), as_arg(work / "fatigue_result.csv"))
    fatigue_raw = pd.read_csv(work / "fatigue_result.csv")
    by_split = fatigue_raw[fatigue_raw["model"].str.startswith("accuracy_split_")]
    pooled_position = pd.DataFrame(
        [
            {
                "model": "accuracy (averaged over splits)",
                "term": "position_per_10",
                "estimate": by_split["estimate"].mean(),
                "se": by_split["se"].mean(),
                "statistic": by_split["estimate"].mean() / by_split["se"].mean(),
                "p": float(2 * stats.norm.sf(abs(by_split["estimate"].mean() / by_split["se"].mean()))),
                "ci_low": by_split["estimate"].mean() - 1.96 * by_split["se"].mean(),
                "ci_high": by_split["estimate"].mean() + 1.96 * by_split["se"].mean(),
                "singular": bool(by_split["singular"].any()),
                "scale": "log odds",
            }
        ]
    )
    fatigue = pd.concat(
        [fatigue_raw[~fatigue_raw["model"].str.startswith("accuracy_split_")], pooled_position], ignore_index=True
    )

    accuracy = _accuracy_summary(curves, group_ceiling, config)
    k90_primary = _k90_summary(primary["k90_raw"], config)
    k90_secondary = _k90_summary(primary["k90_corrected"], config)
    zero = _zero_baselines(curves, config)
    description = _describe_clusters(data, primary["answers"], config)
    gamma = _gamma_sensitivity(description.scratch, config)
    groups = _group_tables(data, curves, primary["k90_raw"], description, config)

    per_person = curves[(curves["start"] == "scratch") & (curves["k"] > 0)].copy()
    per_person["ceiling"] = per_person["participant"].map(raw)
    per_person["share_of_ceiling_raw"] = per_person["accuracy"] / per_person["ceiling"]
    per_person["share_of_ceiling_display"] = per_person["share_of_ceiling_raw"].clip(upper=1.0)

    mlp = primary["results"].mlp.groupby("k", as_index=False)[["logistic", "mlp"]].mean()
    meta = primary["results"].meta
    loo_summary = pd.DataFrame(
        [
            {
                "sigma_values": ", ".join(f"{s:g} ({n})" for s, n in meta["sigma"].value_counts().sort_index().items()),
                "cluster_counts": ", ".join(
                    f"k={k} ({n})" for k, n in meta["k_clusters"].value_counts().sort_index().items()
                ),
                "beta_side_mean": meta["beta_side"].mean(),
                "beta_side_range": f"{meta['beta_side'].min():.3f} to {meta['beta_side'].max():.3f}",
                "kappa_mean": meta["kappa"].mean(),
                "kappa_range": f"{meta['kappa'].min():.3f} to {meta['kappa'].max():.3f}",
            }
        ]
    )
    cluster_summary = pd.DataFrame(
        [
            {
                "k": description.k,
                "silhouette": description.silhouette,
                "stability_ari_mean": description.stability_ari,
                "stability_ari_low": description.stability_low,
                "stability_ari_high": description.stability_high,
                "sizes": ", ".join(str(int((description.labels == c).sum())) for c in range(description.k)),
            }
        ]
    )
    exclusions = pd.DataFrame(
        [
            {"rule": e.rule, "action": e.action, "count": e.count, "unit": e.unit, "ids": ", ".join(e.ids)}
            for e in data.log
        ]
    )

    # Sensitivity: attention failures kept in.
    failed = next((e.ids for e in data.log if "attention" in e.rule), [])
    sensitivity = None
    if failed and config.cleaning.exclude_attention_failures:
        sensitivity = _analyse(export_data, config, exclude_attention=False, work=work, label="attention_kept")
        sensitivity_k90 = _k90_summary(sensitivity["k90_raw"], config)
        sensitivity_accuracy = _accuracy_summary(
            sensitivity["curves"], float(sensitivity["ceilings_raw"].mean()), config
        )

    truth = None
    truth_path = export_path.with_suffix(".truth.json")
    recovery = None
    if export_data.synthetic and truth_path.exists():
        truth = json.loads(truth_path.read_text(encoding="utf-8"))
        recovery = _recovery_checks(data, truth, description, curves, config)

    # Tables.
    run.write_table("exclusions", exclusions, "Exclusions and flags")
    run.write_table(
        "self_consistency",
        data.participants[["participant_code", "group", "n_consistent", "n_repeats", "self_consistency"]],
        "Self-consistency per participant",
    )
    run.write_table("fatigue", fatigue, "Fatigue models. Half and gap: consistent ~ half + gap + (1|participant).")
    run.write_table("accuracy_by_start", accuracy, "Accuracy by starting point and k with 95% bootstrap CIs")
    run.write_table("accuracy_per_participant", per_person, "Scratch model accuracy per participant")
    run.write_table("k90_raw_ceiling", k90_primary, "k90 per starting point, raw self-consistency ceiling (primary)")
    run.write_table("k90_corrected_ceiling", k90_secondary, "k90 per starting point, corrected ceiling (secondary)")
    run.write_table(
        "k90_per_participant",
        primary["k90_raw"].assign(k90=lambda d: d["k90"].map(format_k)),
        "k90 per participant and starting point",
    )
    run.write_table("contrasts", primary["contrasts"], "Pairwise starting-point contrasts at each k (Holm within k)")
    run.write_table("zero_comparisons", zero, "No comparisons at all (k = 0)")
    run.write_table("clusters", cluster_summary, "Choice-based clusters, all eligible participants")
    run.write_table(
        "cluster_weights",
        pd.DataFrame(description.weights, columns=list(FEATURES)).assign(cluster=lambda d: d.index + 1),
        "Pooled weights per cluster",
    )
    run.write_table("loo_models", loo_summary, "Leave-one-out sigma, cluster counts and nuisance terms")
    run.write_table("gamma_sensitivity", gamma, "Personal targets that move under an assumed linear busyness bias")
    run.write_table("mlp_robustness", mlp, "Secondary MLP vs the primary logistic model, scratch")
    for name, table in groups.items():
        run.write_table(f"group_{name}", table, f"Descriptive only: CS vs non-CS, {name}")
    if slopes is not None:
        run.write_table("contrasts_slopes_sensitivity", slopes, "Sensitivity: contrasts with (start|participant)")
    if sensitivity is not None:
        run.write_table("contrasts_attention_kept", sensitivity["contrasts"], "Sensitivity: attention failures kept in")
        run.write_table("k90_attention_kept", sensitivity_k90, "Sensitivity: k90 with attention failures kept in")
    if recovery is not None:
        run.write_table("recovery_checks", recovery, "Effects built into the simulation vs what the analysis recovered")

    # Figures.
    figures.learning_curves(run, accuracy, ceiling)
    figures.k90_distribution(
        run, primary["k90_raw"][~primary["k90_raw"]["not_meaningful"]], [0, *config.phase2.k_values]
    )
    figures.consistency_by_group(run, data.participants)
    figures.cluster_profiles(
        run, description.weights, [int((description.labels == c).sum()) for c in range(description.k)]
    )
    figures.weights_by_group(run, groups["weights"])
    figures.curves_by_group(run, groups["curves"])

    # Report.
    report = Report(run, "Phase 2 analysis report")
    n = len(data.participants)
    report.h2("Data and exclusions")
    report.p(
        f"{n} eligible participants, {len(data.main)} main trials, {len(data.repeats)} repeat pairs. Every rule below is switchable in config.yaml."
    )
    report.table(exclusions)
    if n < config.study.n_min:
        report.banner(f"Fewer eligible participants ({n}) than the configured minimum ({config.study.n_min}).")
    report.h2("Model")
    report.p(
        "Bradley-Terry / logistic model fitted by MAP: P(choose left) = sigmoid(w . dx + beta_side + kappa . dcurv). Configs are scored with w . x only."
    )
    report.p(
        "Prior = starting point. Fitting with a Gaussian prior w ~ N(mu, sigma^2 I) is how fine-tuning from a group model works: with no comparisons the estimate is exactly mu, and each comparison pulls it towards the person's own preferences. Scratch uses mu = 0, global uses the pooled weights of everyone else, and the cluster starts use the pooled weights of the assigned cluster. One sigma applies to every starting point, chosen by held-out log-loss averaged over all starting points and k, inside the other participants."
    )
    report.p(
        "Linear busyness is not in the model: numChangedSettings is the exact sum of the 8 dummies, so its coefficient cannot be separated from w. The weights therefore include any general liking for more or less change. Curvature, (busy - 3)^2, is identifiable for this clip set and is included as a nuisance term."
    )
    report.p(
        "Leave-one-out: for each participant the nuisance terms, sigma, global model, clusters and cluster models are rebuilt from everyone else. Their own data only enters through their first k training comparisons."
    )
    report.table(loo_summary)
    report.h3("How far targets move under an assumed busyness bias")
    report.table(gamma)

    report.h2("Self-consistency and fatigue")
    report.p(
        f"Mean self-consistency {group_ceiling:.3f} (95% bootstrap CI {low:.3f} to {high:.3f}), from 10 repeats per person."
    )
    report.figure("consistency_by_group", "Self-consistency by group")
    report.p(
        "The fatigue model is consistent ~ half + trial_gap + (1|participant). Half is second vs first half of the session (trial 42 onwards), controlling for the gap. The position and RT rows are extra checks across the session."
    )
    report.table(fatigue)

    report.h2("RQ1: how many comparisons does a personal model need?")
    report.p(
        "Self-consistency is a noisy estimate of a person's ceiling: it comes from 10 pairs, so it moves in steps of 10%. It is also not the highest reachable accuracy, since test-retest agreement c implies an ideal accuracy of (1 + sqrt(2c - 1)) / 2. The figure therefore also shows the group ceiling with a bootstrap CI and the corrected ceiling. Raw self-consistency is primary and the corrected ceiling secondary."
    )
    report.figure("learning_curves", "Learning curves per starting point with the ceiling band")
    report.table(accuracy)
    report.p(
        'k90 is the smallest k reaching 90% of a person\'s ceiling. ">50" means it was not reached and is treated as censored, not as 50. Participants whose 90% target is at or below chance are counted as "k90 not meaningful" and left out of the medians.'
    )
    report.h3("Raw self-consistency ceiling (primary)")
    report.table(k90_primary)
    report.h3("Corrected ceiling (secondary)")
    report.table(k90_secondary)
    report.figure("k90_distribution", "Distribution of k90 per starting point")

    report.h2("RQ2 and RQ3: starting points")
    report.p(
        "correct ~ start * log(k) + (1|participant) + (1|test_pair), fitted once per test split, with estimates and standard errors averaged across splits. The splits reuse the same responses, so the standard errors are averaged rather than reduced. Holm correction within each k. RQ3 compares cluster_choice with cluster_questionnaire. In this one-group design, 'new users' are held-out participants, not people recruited later."
    )
    report.p(
        f"Model status: {primary['contrast_status']['splits']} splits, {primary['contrast_status']['singular_fits']} singular fits, {primary['contrast_status']['fits_with_warnings']} with convergence warnings."
    )
    report.table(primary["contrasts"])
    report.h3("No comparisons at all (k = 0)")
    report.table(zero)
    if slopes is not None:
        report.h3("Sensitivity: (start|participant)")
        report.p(
            f"Model status: {slopes_status['singular_fits']} of {slopes_status['splits']} fits singular, {slopes_status['fits_with_warnings']} with warnings."
        )
        report.table(slopes)
    report.h3("Clusters")
    report.p(
        "Stability is the bootstrap adjusted Rand index. The profiles use all eligible participants and are descriptive; predictions use the leave-one-out clusters."
    )
    report.table(cluster_summary)
    report.figure("cluster_profiles", "Choice-based cluster weight profiles")

    report.h2("RQ5: CS and non-CS (descriptive only)")
    report.p("Descriptive only: no confirmatory claims and no significance tests.")
    report.table(groups["consistency"])
    report.figure("weights_by_group", "Mean preference weights by group")
    report.figure("curves_by_group", "Scratch learning curve by group")
    report.table(groups["k90"])
    report.h3("Clusters by group")
    report.table(groups["crosstab"])

    report.h2("Robustness: secondary MLP model")
    report.p(
        "A small MLP over the same features, trained from scratch on each person's comparisons. The logistic model remains primary."
    )
    report.table(mlp)

    report.h2("Sensitivity: attention failures kept in")
    if sensitivity is None:
        report.p("No participant failed an attention check, so this analysis would be identical to the primary one.")
    else:
        report.p(f"Adds back: {', '.join(failed)}.")
        report.table(sensitivity_accuracy)
        report.table(sensitivity_k90)
        report.table(sensitivity["contrasts"])

    if recovery is not None:
        report.h2("Recovery of the effects built into the simulation")
        report.table(recovery)

    path = report.write()
    write_manifest(
        run,
        config=config,
        inputs={export_path.name: export_data.sha256},
        seeds_used=config.seeds.model_dump(),
        r_packages=r_versions(("lme4", "lmerTest", "emmeans")),
    )
    return path
