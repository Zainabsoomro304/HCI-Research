"""Compares the Python models with the platform's plan engine on the same export.

The TypeScript engine (src/lib/planEngine) is canonical for plans, because it is what participants experience. The Python
models are the tool for analysis. This module exists so the two can be shown to agree: same weights within a small
tolerance, same cluster assignments and same targets.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from hci.clustering import assign_by_likelihood
from hci.conditions import restricted_argmax
from hci.config import Config
from hci.encoding import BASE_CONFIG_ID
from hci.loo import SharedModels, build_shared, select_sigma_nested
from hci.model import Comparisons, by_participant, estimate_nuisance, fit_map, use_curvature
from hci.node import run_tsx

WEIGHT_TOLERANCE = 1e-5


def _shared_from(people: dict[str, Comparisons], config: Config, *, use_clusters: bool) -> SharedModels:
    nuisance = estimate_nuisance(
        [people[c] for c in sorted(people)],
        sigma=config.model.nuisance_sigma,
        rounds=config.model.nuisance_rounds,
        use_curvature=use_curvature(config.model.curvature, config.model.curvature_max_vif),
    )
    sigma, _ = select_sigma_nested(
        people, None, nuisance=nuisance, config=config, seed=config.seeds.cv_folds, use_clusters=use_clusters
    )
    return build_shared(
        people,
        None,
        sigma=sigma,
        nuisance=nuisance,
        config=config,
        seed=config.seeds.clustering,
        use_clusters=use_clusters,
    )


def python_plans(main: pd.DataFrame, config: Config) -> dict[str, dict[str, Any]]:
    """Every included participant's leave-one-out models and targets, computed in Python."""
    people = by_participant(main)
    use_clusters = len(people) >= config.clusters.min_eligible
    low, high = config.targets.min_changed, config.targets.max_changed
    out: dict[str, dict[str, Any]] = {}
    for code in sorted(people):
        others = {c: d for c, d in people.items() if c != code}
        shared = _shared_from(others, config, use_clusters=use_clusters)
        early = people[code].first(5)
        assigned = assign_by_likelihood(early, shared.choice.weights, shared.nuisance)
        cluster5 = fit_map(early, mu=shared.choice.weights[assigned], sigma=shared.sigma, nuisance=shared.nuisance)
        personal = fit_map(people[code], sigma=shared.sigma, nuisance=shared.nuisance)
        out[code] = {
            "sigma": shared.sigma,
            "beta_side": shared.nuisance.beta_side,
            "kappa": shared.nuisance.kappa,
            "cluster_count": shared.choice.k,
            "assigned": assigned,
            "cluster_labels": shared.choice.labels.tolist(),
            "global_w": shared.global_w,
            "cluster_weights": shared.choice.weights,
            "cluster5_w": cluster5,
            "personal_w": personal,
            "targets": {
                "static": BASE_CONFIG_ID,
                "global": restricted_argmax(shared.global_w, low, high),
                "cluster5": restricted_argmax(cluster5, low, high),
                "personalFull": restricted_argmax(personal, low, high),
            },
        }
    return out


def typescript_plans(main: pd.DataFrame) -> dict[str, Any]:
    included = [
        {
            "code": str(code),
            "trials": [
                {"left": str(a), "right": str(b), "choice": str(c)}
                for a, b, c in zip(group["left_clip_id"], group["right_clip_id"], group["choice"], strict=True)
            ],
        }
        for code, group in main.groupby("participant_code", sort=True)
    ]
    return json.loads(run_tsx("analysis-plan-engine.ts", json.dumps({"included": included})))


@dataclass
class ParityReport:
    participants: int
    max_weight_difference: float
    sigma_matches: int
    cluster_count_matches: int
    cluster_label_matches: int
    assignment_matches: int
    target_matches: int
    target_total: int
    typescript_ms: float
    problems: list[str]

    @property
    def ok(self) -> bool:
        return not self.problems


def compare(main: pd.DataFrame, config: Config) -> ParityReport:
    python = python_plans(main, config)
    typescript = typescript_plans(main)
    problems: list[str] = []
    largest = 0.0
    tally = dict.fromkeys(["sigma", "count", "labels", "assigned", "targets"], 0)
    total_targets = 0

    def check_weights(code: str, name: str, a: Any, b: Any) -> None:
        nonlocal largest
        difference = float(np.max(np.abs(np.asarray(a, dtype=float) - np.asarray(b, dtype=float))))
        largest = max(largest, difference)
        if difference > WEIGHT_TOLERANCE:
            problems.append(f"{code} {name}: weights differ by {difference:.2e}")

    for row in typescript["participants"]:
        code = row["code"]
        ours = python[code]
        tally["sigma"] += row["sigma"] == ours["sigma"]
        if row["sigma"] != ours["sigma"]:
            problems.append(f"{code}: sigma {row['sigma']} (TypeScript) vs {ours['sigma']} (Python)")
        tally["count"] += row["clusterCount"] == ours["cluster_count"]
        if row["clusterCount"] != ours["cluster_count"]:
            problems.append(f"{code}: {row['clusterCount']} clusters (TypeScript) vs {ours['cluster_count']} (Python)")
        tally["assigned"] += row["assignedCluster"] == ours["assigned"]
        if row["assignedCluster"] != ours["assigned"]:
            problems.append(f"{code}: cluster {row['assignedCluster']} (TypeScript) vs {ours['assigned']} (Python)")
        for name, ts_value, py_value in (
            ("beta_side", row["nuisance"]["betaSide"], ours["beta_side"]),
            ("kappa", row["nuisance"]["kappa"], ours["kappa"]),
            ("global", row["globalW"], ours["global_w"]),
            ("cluster5", row["cluster5W"], ours["cluster5_w"]),
            ("personalFull", row["personalW"], ours["personal_w"]),
        ):
            check_weights(code, name, ts_value, py_value)
        if row["clusterCount"] == ours["cluster_count"]:
            check_weights(code, "assigned cluster", row["clusterW"], ours["cluster_weights"][ours["assigned"]])
        for condition, target in row["targets"].items():
            total_targets += 1
            tally["targets"] += target == ours["targets"][condition]
            if target != ours["targets"][condition]:
                problems.append(f"{code} {condition}: {target} (TypeScript) vs {ours['targets'][condition]} (Python)")
    return ParityReport(
        participants=len(typescript["participants"]),
        max_weight_difference=largest,
        sigma_matches=tally["sigma"],
        cluster_count_matches=tally["count"],
        cluster_label_matches=tally["assigned"],
        assignment_matches=tally["assigned"],
        target_matches=tally["targets"],
        target_total=total_targets,
        typescript_ms=float(typescript["elapsedMs"]),
        problems=problems,
    )
