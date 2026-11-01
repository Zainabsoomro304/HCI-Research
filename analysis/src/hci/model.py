"""The primary preference model: Bradley-Terry / logistic regression fitted by MAP.

    P(choose left) = sigmoid( w . (x_left - x_right) + beta_side + kappa . (curv_left - curv_right) )

w holds the person's 8 preference weights. beta_side (left-position bias) and kappa (optional busyness curvature) are
fixed global nuisance terms. Configs are scored with w . x only.

Linear busyness is deliberately absent. numChangedSettings is the exact sum of the 8 dummies, so a term
gamma . (busy_left - busy_right) has the same effect on every choice as adding gamma to every weight: the data cannot
tell them apart. Consequently w includes any general liking for more or less change, and `hci` reports how much
adaptation targets move across a range of gamma values. Curvature, curv = (busy - 3)^2, is not a linear function of the
dummies, so it can be estimated if the clip set supports it (see `curvature_identifiability`).

"Prior = starting point". The fit maximises the likelihood of a person's comparisons under the prior
w ~ N(mu, sigma^2 I). With mu = 0 that is learning from scratch. With mu = a group's pooled weights it is fine-tuning
from that group's model: with no comparisons the estimate is exactly the group model, and each comparison pulls it
towards the person's own preferences. The same sigma is used for every starting point, so differences between them
come from mu alone.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from scipy.special import expit

from hci.encoding import ALL_CONFIG_IDS, ALL_X, FEATURES, encode, num_changed
from hci.platform import platform_info

N_FEATURES = len(FEATURES)
_X = dict(zip(ALL_CONFIG_IDS, ALL_X, strict=True))
_CURV = {c: float((num_changed(c) - 3) ** 2) for c in ALL_CONFIG_IDS}


@dataclass(frozen=True)
class Nuisance:
    beta_side: float = 0.0
    kappa: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return asdict(self)


NO_NUISANCE = Nuisance()


@dataclass(frozen=True)
class Comparisons:
    """One person's (or one pooled group's) comparisons. y = 1 when the left clip was chosen."""

    dx: np.ndarray
    dcurv: np.ndarray
    y: np.ndarray

    def __len__(self) -> int:
        return len(self.y)

    def take(self, index: np.ndarray | slice) -> Comparisons:
        return Comparisons(self.dx[index], self.dcurv[index], self.y[index])

    def first(self, k: int) -> Comparisons:
        return self.take(slice(0, k))

    def offset(self, nuisance: Nuisance) -> np.ndarray:
        return nuisance.beta_side + nuisance.kappa * self.dcurv


def concat(parts: list[Comparisons]) -> Comparisons:
    return Comparisons(
        np.concatenate([p.dx for p in parts]),
        np.concatenate([p.dcurv for p in parts]),
        np.concatenate([p.y for p in parts]),
    )


def comparisons_from_trials(trials: pd.DataFrame) -> Comparisons:
    """Keeps row order, so pass trials in chronological order."""
    left = trials["left_clip_id"].astype(str).tolist()
    right = trials["right_clip_id"].astype(str).tolist()
    return Comparisons(
        dx=np.array([_X[a] - _X[b] for a, b in zip(left, right, strict=True)]).reshape(-1, N_FEATURES),
        dcurv=np.array([_CURV[a] - _CURV[b] for a, b in zip(left, right, strict=True)], dtype=float),
        y=(trials["choice"].astype(str) == "left").to_numpy(dtype=float),
    )


def by_participant(main: pd.DataFrame) -> dict[str, Comparisons]:
    return {str(code): comparisons_from_trials(group) for code, group in main.groupby("participant_code", sort=True)}


def fit_map(
    data: Comparisons,
    *,
    mu: np.ndarray | None = None,
    sigma: float,
    nuisance: Nuisance = NO_NUISANCE,
    max_iter: int = 100,
    tol: float = 1e-8,
) -> np.ndarray:
    """MAP weights under w ~ N(mu, sigma^2 I), by damped Newton. The objective is strictly convex."""
    mu = np.zeros(N_FEATURES) if mu is None else np.asarray(mu, dtype=float)
    if len(data) == 0:
        return mu.copy()
    precision = 1.0 / sigma**2
    offset = data.offset(nuisance)

    def objective(w: np.ndarray) -> float:
        eta = data.dx @ w + offset
        return float(np.logaddexp(0, -eta)[data.y == 1].sum() + np.logaddexp(0, eta)[data.y == 0].sum()) + (
            0.5 * precision * float((w - mu) @ (w - mu))
        )

    w = mu.copy()
    value = objective(w)
    for _ in range(max_iter):
        p = expit(data.dx @ w + offset)
        grad = data.dx.T @ (p - data.y) + precision * (w - mu)
        if np.max(np.abs(grad)) < tol:
            break
        hess = (data.dx * (p * (1 - p))[:, None]).T @ data.dx + precision * np.eye(N_FEATURES)
        step = np.linalg.solve(hess, grad)
        scale = 1.0
        while scale > 1e-6:
            candidate = w - scale * step
            new_value = objective(candidate)
            if new_value <= value:
                break
            scale /= 2
        else:
            break
        w, value = candidate, new_value
    return w


def predict_left(data: Comparisons, w: np.ndarray, nuisance: Nuisance = NO_NUISANCE) -> np.ndarray:
    return expit(data.dx @ w + data.offset(nuisance))


def log_likelihood(data: Comparisons, w: np.ndarray, nuisance: Nuisance = NO_NUISANCE) -> float:
    eta = data.dx @ w + data.offset(nuisance)
    return float(-(np.logaddexp(0, -eta)[data.y == 1].sum() + np.logaddexp(0, eta)[data.y == 0].sum()))


def accuracy(data: Comparisons, w: np.ndarray, nuisance: Nuisance = NO_NUISANCE) -> float:
    return float(((predict_left(data, w, nuisance) >= 0.5) == (data.y == 1)).mean())


def score_configs(w: np.ndarray) -> np.ndarray:
    """Scores of all configs: w . x only, never the nuisance terms."""
    return ALL_X @ w


def fit_pooled(parts: list[Comparisons], *, sigma_pool: float, nuisance: Nuisance = NO_NUISANCE) -> np.ndarray:
    """A group's pooled weights: one model fitted to all of the group's comparisons, under a weak prior."""
    return fit_map(concat(parts), sigma=sigma_pool, nuisance=nuisance)


def _fit_offset_terms(data: Comparisons, person_eta: np.ndarray, use_curvature: bool) -> Nuisance:
    """Newton fit of beta_side (and kappa) with the person-level linear predictor held fixed."""
    design = np.column_stack([np.ones(len(data)), data.dcurv]) if use_curvature else np.ones((len(data), 1))
    theta = np.zeros(design.shape[1])
    for _ in range(50):
        p = expit(design @ theta + person_eta)
        grad = design.T @ (p - data.y)
        if np.max(np.abs(grad)) < 1e-8:
            break
        hess = (design * (p * (1 - p))[:, None]).T @ design + 1e-8 * np.eye(design.shape[1])
        theta -= np.linalg.solve(hess, grad)
    return Nuisance(float(theta[0]), float(theta[1]) if use_curvature else 0.0)


def estimate_nuisance(people: list[Comparisons], *, sigma: float, rounds: int, use_curvature: bool) -> Nuisance:
    """Alternates person-level weights and the global nuisance terms, so that person-to-person differences in w
    do not attenuate beta_side and kappa as they would in a single pooled logistic fit."""
    nuisance = Nuisance()
    pooled = concat(people)
    for _ in range(rounds):
        eta = np.concatenate([p.dx @ fit_map(p, sigma=sigma, nuisance=nuisance) for p in people])
        nuisance = _fit_offset_terms(pooled, eta, use_curvature)
    return nuisance


def select_sigma(
    people: list[Comparisons],
    *,
    grid: list[float],
    folds: int,
    seed: int,
    nuisance: Nuisance = NO_NUISANCE,
) -> tuple[float, dict[float, float]]:
    """Scratch-prior sigma by within-person cross-validated log-loss. Milestone 2 extends the objective to every
    starting point; this version serves the parameter-recovery tests."""
    rng = np.random.default_rng(seed)
    assignments = [rng.permutation(len(p)) % folds for p in people]
    losses: dict[float, float] = {}
    for sigma in grid:
        total, count = 0.0, 0
        for person, fold in zip(people, assignments, strict=True):
            for f in range(folds):
                w = fit_map(person.take(fold != f), sigma=sigma, nuisance=nuisance)
                held_out = person.take(fold == f)
                total -= log_likelihood(held_out, w, nuisance)
                count += len(held_out)
        losses[sigma] = total / count
    return min(losses, key=lambda s: (losses[s], s)), losses


def curvature_identifiability(clips: list[str] | None = None) -> dict[str, float | int | bool]:
    """Rank and variance-inflation checks over all pairs of the analysis clips."""
    clips = clips if clips is not None else platform_info()["clips"]
    x = np.array([encode(c) for c in clips])
    busy = x.sum(axis=1)
    curv = (busy - 3) ** 2
    left, right = np.triu_indices(len(clips), k=1)
    dx, dbusy, dcurv = x[left] - x[right], busy[left] - busy[right], curv[left] - curv[right]
    with_linear = int(np.linalg.matrix_rank(np.column_stack([dx, dbusy])))
    with_curvature = int(np.linalg.matrix_rank(np.column_stack([dx, dcurv])))
    design = np.column_stack([dx, np.ones(len(dx))])
    fitted = design @ np.linalg.lstsq(design, dcurv, rcond=None)[0]
    residual = float(((dcurv - fitted) ** 2).sum())
    total = float(((dcurv - dcurv.mean()) ** 2).sum())
    r2 = 1 - residual / total if total > 0 else 1.0
    return {
        "rank_dummies": int(np.linalg.matrix_rank(dx)),
        "rank_with_linear_busyness": with_linear,
        "rank_with_curvature": with_curvature,
        "curvature_vif": 1 / (1 - r2) if r2 < 1 else float("inf"),
        "curvature_r2_on_dummies": r2,
    }


def use_curvature(mode: str, max_vif: float) -> bool:
    if mode != "auto":
        return mode == "on"
    check = curvature_identifiability()
    return check["rank_with_curvature"] > check["rank_dummies"] and check["curvature_vif"] <= max_vif
