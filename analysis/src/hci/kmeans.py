"""K-means with k-means++ starts, the silhouette score and the seeded random numbers they need.

Line-for-line copies of src/lib/planEngine/kmeans.ts and src/lib/random.ts, so that Python and the platform produce the
same clusters from the same data. The TypeScript engine is canonical for plans; a parity test keeps the two together.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


def _imul(a: int, b: int) -> int:
    return (a * b) & 0xFFFFFFFF


class Mulberry32:
    """createRng() in src/lib/random.ts."""

    def __init__(self, seed: int):
        self.a = seed & 0xFFFFFFFF

    def next(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = _imul(t ^ (t >> 15), t | 1)
        t = (t ^ (t + _imul(t ^ (t >> 7), t | 61))) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    def int(self, low: int, high: int) -> int:
        return low + int(np.floor(self.next() * (high - low + 1)))

    def shuffle(self, items: list) -> list:
        out = list(items)
        for i in range(len(out) - 1, 0, -1):
            j = self.int(0, i)
            out[i], out[j] = out[j], out[i]
        return out


def hash_seed(text: str) -> int:
    """FNV-1a: hashSeed() in src/lib/planEngine/engine.ts."""
    value = 0x811C9DC5
    for ch in text:
        value ^= ord(ch)
        value = (value * 0x01000193) & 0xFFFFFFFF
    return value


@dataclass(frozen=True)
class KMeansResult:
    labels: np.ndarray  # clusters are numbered by first appearance in the point order
    centroids: np.ndarray
    inertia: float

    def predict(self, points: np.ndarray) -> np.ndarray:
        distances = ((points[:, None, :] - self.centroids[None, :, :]) ** 2).sum(axis=2)
        return distances.argmin(axis=1)


def _plus_plus_starts(points: np.ndarray, k: int, rng: Mulberry32) -> np.ndarray:
    n = len(points)
    chosen = [int(np.floor(rng.next() * n))]
    nearest = ((points - points[chosen[0]]) ** 2).sum(axis=1)
    while len(chosen) < k:
        total = float(sum(nearest.tolist()))  # the same summation order as the TypeScript loop
        index = -1
        if total > 0:
            target = rng.next() * total
            cumulative = 0.0
            for i in range(n):
                cumulative += float(nearest[i])
                if nearest[i] > 0 and cumulative >= target:
                    index = i
                    break
            if index < 0:
                index = int(np.nonzero(nearest > 0)[0][-1])
        else:
            index = next(i for i in range(n) if i not in chosen)  # all remaining points coincide
        chosen.append(index)
        nearest = np.minimum(nearest, ((points - points[index]) ** 2).sum(axis=1))
    return points[chosen].copy()


def _lloyd(points: np.ndarray, start: np.ndarray, max_iter: int = 100) -> KMeansResult:
    k = len(start)
    centroids = start
    labels = np.full(len(points), -1)
    for _ in range(max_iter):
        assigned = ((points[:, None, :] - centroids[None, :, :]) ** 2).sum(axis=2).argmin(axis=1)
        changed = not np.array_equal(assigned, labels)
        labels = assigned
        if not changed:
            break
        counts = np.bincount(labels, minlength=k)
        updated = centroids.copy()
        for c in range(k):
            if counts[c] > 0:
                updated[c] = points[labels == c].mean(axis=0)
        for c in range(k):  # an empty cluster restarts at the point farthest from its current centroid
            if counts[c] == 0:
                distances = ((points - updated[labels]) ** 2).sum(axis=1)
                farthest = int(distances.argmax())
                updated[c] = points[farthest]
                labels[farthest] = c
        centroids = updated
    inertia = float(((points - centroids[labels]) ** 2).sum())
    return KMeansResult(labels, centroids, inertia)


def kmeans(points: np.ndarray, k: int, seed: int, inits: int) -> KMeansResult:
    """The lowest-inertia result of `inits` random starts, with clusters renumbered by first appearance."""
    points = np.asarray(points, dtype=float)
    if k < 1 or k > len(points):
        raise ValueError(f"Cannot make {k} clusters from {len(points)} points")
    rng = Mulberry32(seed)
    best: KMeansResult | None = None
    for _ in range(inits):
        result = _lloyd(points, _plus_plus_starts(points, k, rng))
        if best is None or result.inertia < best.inertia - 1e-12:
            best = result
    order: list[int] = []
    for label in best.labels.tolist():
        if label not in order:
            order.append(label)
    order += [c for c in range(k) if c not in order]
    mapping = {old: new for new, old in enumerate(order)}
    return KMeansResult(np.array([mapping[int(v)] for v in best.labels]), best.centroids[order], best.inertia)


def silhouette(points: np.ndarray, labels: np.ndarray) -> float:
    """Mean silhouette over all points. A point alone in its cluster scores 0."""
    points = np.asarray(points, dtype=float)
    labels = np.asarray(labels)
    clusters = np.unique(labels)
    if len(clusters) < 2:
        return 0.0
    distances = np.sqrt(((points[:, None, :] - points[None, :, :]) ** 2).sum(axis=2))
    scores = np.zeros(len(points))
    for i in range(len(points)):
        same = labels == labels[i]
        same[i] = False
        if not same.any():
            continue
        a = distances[i][same].mean()
        b = min(distances[i][labels == c].mean() for c in clusters if c != labels[i])
        denominator = max(a, b)
        if denominator > 0:
            scores[i] = (b - a) / denominator
    return float(scores.mean())
