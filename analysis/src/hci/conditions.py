"""Per-participant condition models for Session B, built leave-one-out.

One group does Session A and then Session B, so each participant's global and cluster models come from everyone except
that participant. Their own comparisons only enter through the fine-tuning (cluster5) and personal (personalFull) fits.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from hci.clustering import assign_by_likelihood, fit_choice_clusters
from hci.encoding import ALL_CONFIG_IDS, BASE_CONFIG_ID, eligible_mask
from hci.model import Comparisons, Nuisance, estimate_nuisance, fit_map, fit_pooled, score_configs


@dataclass(frozen=True)
class ConditionModels:
    nuisance: Nuisance
    global_w: np.ndarray
    cluster_k: int
    cluster_weights: np.ndarray
    cluster5_assigned: int
    cluster5_w: np.ndarray
    personal_w: np.ndarray


def restricted_argmax(w: np.ndarray, min_changed: int, max_changed: int) -> str:
    """The best config among those changing min_changed..max_changed settings from the base."""
    scores = score_configs(w)
    scores = np.where(eligible_mask(min_changed, max_changed), scores, -np.inf)
    return ALL_CONFIG_IDS[int(np.argmax(scores))]


def unrestricted_argmax(w: np.ndarray) -> str:
    return ALL_CONFIG_IDS[int(np.argmax(score_configs(w)))]


def condition_models(
    code: str,
    people: dict[str, Comparisons],
    *,
    sigma: float,
    sigma_pool: float,
    nuisance_sigma: float,
    nuisance_rounds: int,
    use_curvature: bool,
    candidates: list[int],
    seed: int,
    n_init: int,
    fine_tune_k: int = 5,
) -> ConditionModels:
    """Everything shared (nuisance terms, global model, clusters) is computed from `others` only."""
    others = [data for other, data in sorted(people.items()) if other != code]
    own = people[code]
    nuisance = estimate_nuisance(others, sigma=nuisance_sigma, rounds=nuisance_rounds, use_curvature=use_curvature)
    global_w = fit_pooled(others, sigma_pool=sigma_pool, nuisance=nuisance)
    scratch = np.array([fit_map(p, sigma=sigma, nuisance=nuisance) for p in others])
    clusters = fit_choice_clusters(
        scratch, others, candidates=candidates, seed=seed, n_init=n_init, sigma_pool=sigma_pool, nuisance=nuisance
    )
    first = own.first(fine_tune_k)
    assigned = assign_by_likelihood(first, clusters.weights, nuisance)
    return ConditionModels(
        nuisance=nuisance,
        global_w=global_w,
        cluster_k=clusters.k,
        cluster_weights=clusters.weights,
        cluster5_assigned=assigned,
        cluster5_w=fit_map(first, mu=clusters.weights[assigned], sigma=sigma, nuisance=nuisance),
        personal_w=fit_map(own, sigma=sigma, nuisance=nuisance),
    )


def condition_targets(models: ConditionModels, min_changed: int, max_changed: int) -> dict[str, str]:
    return {
        "static": BASE_CONFIG_ID,
        "global": restricted_argmax(models.global_w, min_changed, max_changed),
        "cluster5": restricted_argmax(models.cluster5_w, min_changed, max_changed),
        "personalFull": restricted_argmax(models.personal_w, min_changed, max_changed),
    }
