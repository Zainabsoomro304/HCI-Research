"""K-means over preference weights, and likelihood-based assignment of a person to a cluster.

Uses hci.kmeans, a copy of the platform's own k-means, so Python and the platform produce the same clusters.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from hci.kmeans import kmeans, silhouette
from hci.model import Comparisons, Nuisance, fit_pooled, log_likelihood


@dataclass(frozen=True)
class ChoiceClusters:
    labels: np.ndarray
    weights: np.ndarray  # one pooled weight vector per cluster
    silhouette: float | None  # None with one cluster

    @property
    def k(self) -> int:
        return len(self.weights)


def choose_k(
    points: np.ndarray, candidates: list[int], *, seed: int, n_init: int
) -> tuple[int, np.ndarray, float | None]:
    """Highest silhouette among the candidate cluster counts; ties go to the smaller k. One cluster if none can fit."""
    best: tuple[int, np.ndarray, float | None] | None = None
    for k in sorted(candidates):
        if k >= len(points):
            continue
        labels = kmeans(points, k, seed, n_init).labels
        score = silhouette(points, labels)
        if best is None or score > best[2]:
            best = (k, labels, score)
    return best if best is not None else (1, np.zeros(len(points), dtype=int), None)


def fit_choice_clusters(
    weights: np.ndarray,
    people: list[Comparisons],
    *,
    candidates: list[int],
    seed: int,
    n_init: int,
    sigma_pool: float,
    nuisance: Nuisance,
    use_clusters: bool = True,
) -> ChoiceClusters:
    """With use_clusters False (too few eligible participants), the single cluster is the global model."""
    k, labels, score = (
        choose_k(weights, candidates, seed=seed, n_init=n_init)
        if use_clusters
        else (1, np.zeros(len(people), dtype=int), None)
    )
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
    return ChoiceClusters(labels=labels, weights=pooled, silhouette=score)


def assign_by_likelihood(data: Comparisons, cluster_weights: np.ndarray, nuisance: Nuisance) -> int:
    """The cluster whose model gives `data` the highest likelihood. Pass only training comparisons."""
    return int(np.argmax([log_likelihood(data, w, nuisance) for w in cluster_weights]))
