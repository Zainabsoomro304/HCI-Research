"""Parameter recovery on SYNTHETIC data: can the model get the known weights back?

Only w + gamma (every weight shifted by the linear busyness bias) is identifiable, so that is the recovery target.
Correlation cannot see a constant shift, so r alone would pass whatever gamma is. The report therefore also gives the
mean signed error and RMSE, against both w + gamma and the raw w. Shrinkage from the prior also shows up in these.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from hci.clean import clean
from hci.config import Config
from hci.io import load_export
from hci.model import by_participant, estimate_nuisance, fit_map, select_sigma, use_curvature


def _correlation(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.corrcoef(a, b)[0, 1])


def recovery_report(
    export_path: Path, truth_path: Path, config: Config, *, ks: tuple[int, ...] = (5, 10, 20, 30, 50, 70)
) -> dict[str, Any]:
    truth = json.loads(Path(truth_path).read_text(encoding="utf-8"))
    if not truth.get("SYNTHETIC"):
        raise ValueError(f"{truth_path} is not SYNTHETIC ground truth")
    export = load_export(export_path)
    data = clean(export, config)
    people = by_participant(data.main)
    codes = sorted(people)
    gamma = truth["busy_gamma"]
    raw_true = {p["participant_code"]: np.array(p["w"]) for p in truth["participants"]}
    identifiable = {code: raw_true[code] + gamma for code in codes}
    parts = [people[c] for c in codes]

    curvature = use_curvature(config.model.curvature, config.model.curvature_max_vif)
    nuisance = estimate_nuisance(
        parts, sigma=config.model.nuisance_sigma, rounds=config.model.nuisance_rounds, use_curvature=curvature
    )
    sigma, losses = select_sigma(
        [p.first(50) for p in parts],
        grid=config.model.sigma_grid,
        folds=config.model.sigma_cv_folds,
        seed=config.seeds.cv_folds,
        nuisance=nuisance,
    )
    curves = {}
    for k in ks:
        fitted = np.array([fit_map(people[c].first(k), sigma=sigma, nuisance=nuisance) for c in codes])
        target = np.array([identifiable[c] for c in codes])
        raw = np.array([raw_true[c] for c in codes])
        per_person = np.array([_correlation(f, t) for f, t in zip(fitted, target, strict=True)])
        # Individual differences: within each true cluster and weight, does the estimate track the person's deviation?
        clusters = np.array(
            [next(p["cluster"] for p in truth["participants"] if p["participant_code"] == c) for c in codes]
        )
        deviation_fit = fitted.copy()
        deviation_true = target.copy()
        for cluster in np.unique(clusters):
            members = clusters == cluster
            deviation_fit[members] -= fitted[members].mean(axis=0)
            deviation_true[members] -= target[members].mean(axis=0)
        curves[k] = {
            "mean_person_r": float(per_person.mean()),
            "median_person_r": float(np.median(per_person)),
            "min_person_r": float(per_person.min()),
            "share_people_above_0_8": float((per_person > 0.8).mean()),
            "pooled_r": _correlation(fitted.ravel(), target.ravel()),
            "rmse_vs_w_plus_gamma": float(np.sqrt(((fitted - target) ** 2).mean())),
            "mean_error_vs_w_plus_gamma": float((fitted - target).mean()),
            "mean_error_vs_raw_w": float((fitted - raw).mean()),
            "shrinkage_slope": float(np.polyfit(target.ravel(), fitted.ravel(), 1)[0]),
            "within_cluster_deviation_r": _correlation(deviation_fit.ravel(), deviation_true.ravel()),
        }
    expected = np.array([p["expected_consistency"] for p in truth["participants"]])
    observed = data.participants["self_consistency"].to_numpy(float)
    return {
        "SYNTHETIC": True,
        "n_participants": len(codes),
        "sigma": sigma,
        "sigma_losses": {str(s): round(v, 4) for s, v in losses.items()},
        "nuisance": nuisance.to_dict(),
        "true_side_bias": truth["side_bias"],
        "true_busy_curvature": truth["busy_curvature"],
        "curvature_in_model": curvature,
        "by_k": curves,
        "expected_consistency": {
            "min": float(expected.min()),
            "p10": float(np.quantile(expected, 0.1)),
            "median": float(np.median(expected)),
            "p90": float(np.quantile(expected, 0.9)),
            "max": float(expected.max()),
        },  # fmt: skip
        "observed_consistency": {
            "min": float(np.nanmin(observed)),
            "median": float(np.nanmedian(observed)),
            "max": float(np.nanmax(observed)),
        },  # fmt: skip
    }
