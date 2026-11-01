from __future__ import annotations

import numpy as np
import pytest
from scipy.special import expit

from hci.encoding import ALL_CONFIG_IDS, ALL_NUM_CHANGED, ALL_X, encode, num_changed
from hci.model import (
    Comparisons,
    Nuisance,
    accuracy,
    curvature_identifiability,
    estimate_nuisance,
    fit_map,
    fit_pooled,
    log_likelihood,
    predict_left,
    score_configs,
    select_sigma,
    use_curvature,
)
from hci.platform import platform_info


def _simulated(
    seed: int = 0, n: int = 60, w: np.ndarray | None = None, beta: float = 0.0, kappa: float = 0.0
) -> tuple[Comparisons, np.ndarray]:
    rng = np.random.default_rng(seed)
    w = rng.normal(0, 2, 8) if w is None else w
    clips = platform_info()["clips"]
    pairs = [rng.choice(len(clips), 2, replace=False) for _ in range(n)]
    dx = np.array([encode(clips[a]) - encode(clips[b]) for a, b in pairs])
    dcurv = np.array(
        [(num_changed(clips[a]) - 3) ** 2 - (num_changed(clips[b]) - 3) ** 2 for a, b in pairs], dtype=float
    )
    y = (rng.random(n) < expit(dx @ w + beta + kappa * dcurv)).astype(float)
    return Comparisons(dx, dcurv, y), w


def test_no_comparisons_returns_the_prior_mean_for_every_starting_point():
    data, _ = _simulated()
    empty = data.first(0)
    mu = np.arange(8.0)
    assert np.array_equal(fit_map(empty, sigma=1.0), np.zeros(8))  # scratch
    assert np.array_equal(fit_map(empty, mu=mu, sigma=1.0), mu)  # global or cluster start


def test_map_solves_the_penalised_score_equation():
    data, _ = _simulated()
    mu, sigma, nuisance = np.linspace(-1, 1, 8), 1.5, Nuisance(0.2, -0.1)
    w = fit_map(data, mu=mu, sigma=sigma, nuisance=nuisance)
    gradient = data.dx.T @ (predict_left(data, w, nuisance) - data.y) + (w - mu) / sigma**2
    assert np.max(np.abs(gradient)) < 1e-6


@pytest.mark.parametrize("label", ["scratch", "global", "cluster"])
def test_each_prior_is_pulled_towards_its_own_mean(label):
    data, _ = _simulated(n=20)
    mu = {"scratch": np.zeros(8), "global": np.full(8, 1.0), "cluster": np.linspace(-2, 2, 8)}[label]
    tight = fit_map(data, mu=mu, sigma=0.01)
    loose = fit_map(data, mu=mu, sigma=1.0)
    assert np.allclose(tight, mu, atol=0.01)
    assert np.linalg.norm(loose - mu) > np.linalg.norm(tight - mu)


def test_more_comparisons_move_a_wrong_prior_towards_the_truth():
    data, w = _simulated(n=400, seed=2)
    wrong = -w
    errors = [np.linalg.norm(fit_map(data.first(k), mu=wrong, sigma=1.0) - w) for k in (0, 20, 100, 400)]
    assert errors == sorted(errors, reverse=True)


def test_large_sigma_approaches_maximum_likelihood():
    import statsmodels.api as sm

    data, _ = _simulated(n=400, seed=3, w=np.array([1.0, -1, 0.5, -0.5, 1, 0, -1, 0.5]))
    ml = sm.Logit(data.y, data.dx).fit(disp=0).params
    assert np.allclose(fit_map(data, sigma=1000.0), ml, atol=1e-2)


def test_the_fit_is_invariant_to_row_order():
    data, _ = _simulated()
    order = np.random.default_rng(1).permutation(len(data))
    assert np.allclose(fit_map(data, sigma=1.0), fit_map(data.take(order), sigma=1.0), atol=1e-6)


def test_config_scores_exclude_the_nuisance_terms():
    w = np.arange(8.0)
    assert np.array_equal(score_configs(w), ALL_X @ w)
    assert score_configs(w).shape == (108,)
    assert score_configs(np.zeros(8)).max() == 0


def test_linear_busyness_cannot_be_separated_from_the_weights():
    """A gamma on busyness predicts exactly what adding gamma to every weight predicts."""
    check = curvature_identifiability()
    assert check["rank_dummies"] == check["rank_with_linear_busyness"] == 8
    data, w = _simulated()
    gamma = 0.7
    dbusy = data.dx.sum(axis=1)
    assert np.allclose(data.dx @ w + gamma * dbusy, data.dx @ (w + gamma))
    assert np.array_equal(ALL_X.sum(axis=1).astype(int), ALL_NUM_CHANGED)


def test_curvature_is_identifiable_for_the_real_clip_set():
    check = curvature_identifiability()
    assert check["rank_with_curvature"] == 9
    assert check["curvature_vif"] < 10
    assert use_curvature("auto", 10.0) is True
    assert use_curvature("off", 10.0) is False
    assert use_curvature("on", 10.0) is True
    assert use_curvature("auto", 1.0) is False  # a stricter limit rejects it


def test_nuisance_terms_are_estimated_across_people():
    rng_seeds = range(30)
    people = [_simulated(seed=s, n=70, beta=0.5, kappa=0.4)[0] for s in rng_seeds]
    nuisance = estimate_nuisance(people, sigma=4.0, rounds=6, use_curvature=True)
    assert 0.25 < nuisance.beta_side < 0.65
    assert 0.2 < nuisance.kappa < 0.6
    without = estimate_nuisance(people, sigma=4.0, rounds=2, use_curvature=False)
    assert without.kappa == 0.0


def test_pooled_fit_uses_everyones_comparisons():
    a, _ = _simulated(seed=1, w=np.full(8, 2.0))
    b, _ = _simulated(seed=2, w=np.full(8, -2.0))
    only_a = fit_pooled([a], sigma_pool=10.0)
    both = fit_pooled([a, b], sigma_pool=10.0)
    assert only_a.mean() > 1
    assert abs(both.mean()) < only_a.mean() / 2


def test_sigma_selection_is_deterministic_and_from_the_grid():
    people = [_simulated(seed=s, n=50)[0] for s in range(6)]
    first = select_sigma(people, grid=[0.5, 1.0, 2.0], folds=3, seed=9)
    second = select_sigma(people, grid=[0.5, 1.0, 2.0], folds=3, seed=9)
    assert first == second
    assert first[0] in (0.5, 1.0, 2.0)


def test_likelihood_and_accuracy_agree_with_predictions():
    data, w = _simulated(n=200)
    p = predict_left(data, w)
    assert log_likelihood(data, w) == pytest.approx(float((data.y * np.log(p) + (1 - data.y) * np.log(1 - p)).sum()))
    assert accuracy(data, w) > 0.7


def test_config_ids_cover_the_eligible_range_used_by_clips():
    assert {num_changed(c) for c in platform_info()["clips"]} == {2, 3, 4}
    assert len(ALL_CONFIG_IDS) == 108
