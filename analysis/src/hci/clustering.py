"""K-means over preference weights, and likelihood-based assignment of a person to a cluster."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from hci.model import Comparisons, Nuisance, fit_pooled, log_likelihood


@dataclass(frozen=True)
class ChoiceClusters:
    labels: np.ndarray
    weights: np.ndarray  # one pooled weight vector per cluster
    silhouette: float

    @property
    def k(self) -> int:
        return len(self.weights)


def choose_k(points: np.ndarray, candidates: list[int], *, seed: int, n_init: int) -> tuple[int, np.ndarray, float]:
    """Highest silhouette among the candidate cluster counts; ties go to the smaller k."""
    best: tuple[int, np.ndarray, float] | None = None
    for k in sorted(candidates):
        if k >= len(points):
            continue
        labels = KMeans(n_clusters=k, n_init=n_init, random_state=seed).fit_predict(points)
        score = float(silhouette_score(points, labels))
        if best is None or score > best[2]:
            best = (k, labels, score)
    if best is None:
        raise ValueError(f"Too few participants ({len(points)}) for cluster counts {candidates}")
    return best


def fit_choice_clusters(
    weights: np.ndarray,
    people: list[Comparisons],
    *,
    candidates: list[int],
    seed: int,
    n_init: int,
    sigma_pool: float,
    nuisance: Nuisance,
) -> ChoiceClusters:
    k, labels, silhouette = choose_k(weights, candidates, seed=seed, n_init=n_init)
    pooled = np.array(
        [
            fit_pooled(
                [p for p, label in zip(people, labels, strict=True) if label == c],
                sigma_pool=sigma_pool,
                nuisance=nuisance,
            )
            for c in range(k)
        ]
    )
    return ChoiceClusters(labels=labels, weights=pooled, silhouette=silhouette)


def assign_by_likelihood(data: Comparisons, cluster_weights: np.ndarray, nuisance: Nuisance) -> int:
    """The cluster whose model gives `data` the highest likelihood. Pass only training comparisons."""
    return int(np.argmax([log_likelihood(data, w, nuisance) for w in cluster_weights]))
