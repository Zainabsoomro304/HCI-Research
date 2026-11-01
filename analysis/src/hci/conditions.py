"""Per-participant condition models for Session B, built leave-one-out.

One group does Session A and then Session B, so each participant's global and cluster models come from everyone except
that participant. Their own comparisons only enter through the fine-tuning (cluster5) and personal (personalFull) fits.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from hci.clustering import assign_by_likelihood
from hci.config import Config
from hci.encoding import ALL_CONFIG_IDS, BASE_CONFIG_ID, eligible_mask
from hci.loo import build_shared
from hci.model import Comparisons, Nuisance, estimate_nuisance, fit_map, score_configs


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
    use_curvature: bool,
    config: Config,
    fine_tune_k: int = 5,
) -> ConditionModels:
    """Everything shared (nuisance terms, global model, clusters) is computed from `others` only."""
    others = {other: data for other, data in people.items() if other != code}
    own = people[code]
    nuisance = estimate_nuisance(
        [others[c] for c in sorted(others)],
        sigma=config.model.nuisance_sigma,
        rounds=config.model.nuisance_rounds,
        use_curvature=use_curvature,
    )
    shared = build_shared(others, None, sigma=sigma, nuisance=nuisance, config=config, seed=config.seeds.clustering)
    first = own.first(fine_tune_k)
    assigned = assign_by_likelihood(first, shared.choice.weights, nuisance)
    return ConditionModels(
        nuisance=nuisance,
        global_w=shared.global_w,
        cluster_k=shared.choice.k,
        cluster_weights=shared.choice.weights,
        cluster5_assigned=assigned,
        cluster5_w=fit_map(first, mu=shared.choice.weights[assigned], sigma=sigma, nuisance=nuisance),
        personal_w=fit_map(own, sigma=sigma, nuisance=nuisance),
    )


def condition_targets(models: ConditionModels, min_changed: int, max_changed: int) -> dict[str, str]:
    return {
        "static": BASE_CONFIG_ID,
        "global": restricted_argmax(models.global_w, min_changed, max_changed),
        "cluster5": restricted_argmax(models.cluster5_w, min_changed, max_changed),
        "personalFull": restricted_argmax(models.personal_w, min_changed, max_changed),
    }
