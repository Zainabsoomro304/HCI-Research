from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from hci.clean import clean
from hci.io import load_export
from hci.learning import (
    CENSORED,
    censored_median,
    corrected_ceiling,
    format_k,
    k90,
    not_meaningful,
    person_k90,
    run_learning_curves,
)
from hci.loo import build_shared, make_split, select_sigma_nested, split_rng, start_weights
from hci.model import NO_NUISANCE, Comparisons, Nuisance, by_participant, fit_map
from hci.outputs import Report, Run, to_latex
from hci.questionnaire import N_DIMENSIONS, encode_answers, questionnaire_vectors

NEUTRAL = dict.fromkeys(["prefLayout", "prefTextSize", "prefDetail", "prefTheme", "prefMenu"], "noPreference")


@pytest.fixture(scope="module")
def cleaned(synthetic_zip: Path, config):
    return clean(load_export(synthetic_zip), config, exclude_attention=False)


@pytest.fixture(scope="module")
def people(cleaned) -> dict[str, Comparisons]:
    return by_participant(cleaned.main)


@pytest.fixture(scope="module")
def answers(synthetic_zip: Path, cleaned, config) -> dict[str, np.ndarray]:
    return questionnaire_vectors(
        load_export(synthetic_zip).background, cleaned.codes(), config.study.comparison_session_types
    )


def _shared(people, answers, config, exclude: str, sigma: float = 2.0, nuisance: Nuisance = NO_NUISANCE):
    others = {c: d for c, d in people.items() if c != exclude}
    other_answers = {c: a for c, a in answers.items() if c != exclude}
    return build_shared(
        others, other_answers, sigma=sigma, nuisance=nuisance, config=config, seed=config.seeds.clustering
    )


# k90 and its censoring


def test_k90_is_the_smallest_k_reaching_the_target():
    assert k90({5: 0.6, 10: 0.7, 20: 0.75, 30: 0.8, 50: 0.82}, 0.8) == 20  # the target is 0.72
    assert k90({5: 0.73, 10: 0.7}, 0.8) == 5


def test_k90_not_reached_is_censored_not_fifty():
    result = k90({5: 0.55, 10: 0.6, 20: 0.62, 30: 0.64, 50: 0.65}, 0.9)
    assert result == CENSORED
    assert np.isinf(result)
    assert format_k(result) == ">50"


def test_k90_reaching_at_fifty_is_fifty():
    assert k90({5: 0.55, 10: 0.6, 20: 0.62, 30: 0.64, 50: 0.81}, 0.9) == 50


def test_k90_can_be_zero_for_starting_points_defined_there():
    assert k90({0: 0.9, 5: 0.5}, 0.9) == 0


def test_censored_values_stay_at_the_top_of_the_median():
    assert censored_median(np.array([5.0, 10.0, CENSORED])) == 10
    assert censored_median(np.array([5.0, CENSORED, CENSORED])) == CENSORED
    assert censored_median(np.array([5.0, 10.0, 20.0, CENSORED])) == 15
    assert censored_median(np.array([5.0, 10.0, CENSORED, CENSORED])) == CENSORED


def test_person_k90_flags_ceilings_at_or_below_chance():
    curves = pd.DataFrame(
        {"participant": ["a", "a", "b", "b"], "start": "scratch", "k": [5, 10, 5, 10], "accuracy": [0.6, 0.7, 0.6, 0.7]}
    )
    table = person_k90(curves, pd.Series({"a": 0.5, "b": 0.7}), 0.9).set_index("participant")
    assert bool(table.loc["a", "not_meaningful"]) is True  # 0.9 * 0.5 = 0.45 is below chance
    assert bool(table.loc["b", "not_meaningful"]) is False
    assert table.loc["b", "k90"] == 10  # target 0.63
    assert not_meaningful(0.55) is True  # 0.495
    assert not_meaningful(0.6) is False
    assert not_meaningful(float("nan")) is True


@pytest.mark.parametrize(("consistency", "expected"), [(1.0, 1.0), (0.5, 0.5), (0.4, 0.5), (0.68, 0.8)])
def test_corrected_ceiling(consistency, expected):
    assert corrected_ceiling(consistency) == pytest.approx(expected)


def test_corrected_ceiling_inverts_test_retest_agreement():
    for p in (0.6, 0.75, 0.9):
        assert corrected_ceiling(p**2 + (1 - p) ** 2) == pytest.approx(p)
    assert np.isnan(corrected_ceiling(float("nan")))


# Questionnaire encoding


def test_no_preference_is_neutral_and_differs_from_the_reference_level():
    neutral = encode_answers(NEUTRAL)
    assert neutral.shape == (N_DIMENSIONS,)
    assert np.array_equal(neutral, np.zeros(N_DIMENSIONS))
    chose_list = encode_answers({**NEUTRAL, "prefLayout": "list"})
    assert not np.array_equal(chose_list, neutral)
    assert chose_list[:3].sum() == pytest.approx(0)
    assert chose_list[0] == pytest.approx(2 / 3)


def test_unknown_answers_and_missing_questionnaires_fail(synthetic_zip: Path, config):
    with pytest.raises(ValueError, match="unexpected answer"):
        encode_answers({**NEUTRAL, "prefTheme": "purple"})
    with pytest.raises(ValueError, match="P3-999"):
        questionnaire_vectors(load_export(synthetic_zip).background, ["P3-999"], config.study.comparison_session_types)


# Splits


def test_split_is_20_test_and_50_chronological_training_trials():
    test, pool = make_split(70, 20, split_rng(1, "P3-001", 0))
    assert len(test) == 20
    assert len(pool) == 50
    assert np.array_equal(pool, np.sort(pool))
    assert not set(test) & set(pool)


def test_splits_depend_only_on_seed_participant_and_split():
    a = make_split(70, 20, split_rng(1, "P3-001", 0))[0]
    assert np.array_equal(a, make_split(70, 20, split_rng(1, "P3-001", 0))[0])
    assert not np.array_equal(a, make_split(70, 20, split_rng(1, "P3-001", 1))[0])
    assert not np.array_equal(a, make_split(70, 20, split_rng(1, "P3-002", 0))[0])


# Leave-one-out: no information about the held-out person may reach their starting point


def test_shared_models_never_receive_the_held_out_person(people, answers, config):
    code = "P3-006"
    flipped = {**people, code: replace(people[code], y=1 - people[code].y)}
    other_answers = {**answers, code: -answers[code]}
    a = _shared(people, answers, config, code)
    b = _shared(flipped, other_answers, config, code)
    assert np.array_equal(a.global_w, b.global_w)
    assert np.array_equal(a.choice.weights, b.choice.weights)
    assert np.array_equal(a.questionnaire_weights, b.questionnaire_weights)
    assert np.array_equal(a.questionnaire_centroids, b.questionnaire_centroids)


def test_a_participants_data_does_reach_other_peoples_models(people, answers, config):
    code = "P3-006"
    flipped = {**people, code: replace(people[code], y=1 - people[code].y)}
    assert not np.array_equal(
        _shared(people, answers, config, "P3-007").global_w, _shared(flipped, answers, config, "P3-007").global_w
    )


def test_sigma_selection_only_uses_the_others(people, answers, config):
    code = "P3-006"
    cfg = config.model_copy(deep=True)
    cfg.model.sigma_grid = [0.5, 2.0]
    others = {c: d for c, d in people.items() if c != code}
    other_answers = {c: a for c, a in answers.items() if c != code}
    first = select_sigma_nested(others, other_answers, nuisance=Nuisance(), config=cfg, seed=1)
    second = select_sigma_nested(others, other_answers, nuisance=Nuisance(), config=cfg, seed=1)
    assert first == second
    assert first[0] in cfg.model.sigma_grid
    assert set(first[1]) == {0.5, 2.0}


# Starting points


def test_cluster_assignment_only_sees_the_first_k_training_comparisons(people, answers, config):
    code = "P3-006"
    shared = _shared(people, answers, config, code)
    test, pool = make_split(70, 20, split_rng(1, code, 0))
    train = people[code].take(pool)
    k = 5
    later_flipped = replace(train, y=np.concatenate([train.y[:k], 1 - train.y[k:]]))
    original = start_weights(train, answers[code], shared, [k])
    changed = start_weights(later_flipped, answers[code], shared, [k])
    for start in ("scratch", "global", "cluster_choice", "cluster_questionnaire"):
        assert np.array_equal(original[(start, k)][0], changed[(start, k)][0])
    assert original[("cluster_choice", k)][1] == changed[("cluster_choice", k)][1]


def test_test_trials_never_reach_any_starting_point(people, answers, config):
    code = "P3-006"
    data = people[code]
    shared = _shared(people, answers, config, code)
    test, pool = make_split(70, 20, split_rng(1, code, 0))
    y = data.y.copy()
    y[test] = 1 - y[test]
    original = start_weights(data.take(pool), answers[code], shared, [5, 50])
    changed = start_weights(replace(data, y=y).take(pool), answers[code], shared, [5, 50])
    for key, (w, cluster) in original.items():
        assert np.array_equal(w, changed[key][0])
        assert cluster == changed[key][1]


def test_only_global_and_questionnaire_exist_without_comparisons(people, answers, config):
    code = "P3-006"
    shared = _shared(people, answers, config, code)
    weights = start_weights(people[code].first(50), answers[code], shared, [5])
    assert {start for start, k in weights if k == 0} == {"global", "cluster_questionnaire"}
    assert np.array_equal(weights[("global", 0)][0], shared.global_w)
    q_cluster = shared.questionnaire_cluster(answers[code])
    assert np.array_equal(weights[("cluster_questionnaire", 0)][0], shared.questionnaire_weights[q_cluster])


def test_questionnaire_clusters_use_the_same_number_of_clusters_as_choice_clusters(people, answers, config):
    shared = _shared(people, answers, config, "P3-006")
    assert len(shared.questionnaire_weights) == shared.choice.k
    assert shared.choice.k in config.clusters.candidates


def test_scratch_fit_equals_a_direct_map_fit(people, answers, config):
    code = "P3-006"
    shared = _shared(people, answers, config, code)
    train = people[code].first(50)
    assert np.array_equal(
        start_weights(train, answers[code], shared, [10])[("scratch", 10)][0], fit_map(train.first(10), sigma=2.0)
    )


@pytest.fixture(scope="module")
def small_config(config):
    cfg = config.model_copy(deep=True)
    cfg.model.sigma_grid = [1.0, 2.0]
    cfg.phase2.n_splits = 2
    cfg.phase2.n_jobs = 1
    return cfg


def test_learning_curves_are_deterministic_and_complete(cleaned, answers, small_config):
    main = cleaned.main[cleaned.main["participant_code"].isin(cleaned.codes()[:6])]
    subset = {c: answers[c] for c in cleaned.codes()[:6]}
    first = run_learning_curves(main, subset, small_config)
    second = run_learning_curves(main, subset, small_config)
    pd.testing.assert_frame_equal(first.rows, second.rows)
    pd.testing.assert_frame_equal(first.mlp, second.mlp)
    expected_combinations = (4 * 5 + 2) * 20 * 2 * 6
    assert len(first.rows) == expected_combinations
    assert first.rows.groupby(["participant", "split", "start", "k"]).size().eq(20).all()
    assert set(first.meta["k_clusters"]) <= set(small_config.clusters.candidates)
    assert first.rows["correct"].isin([0, 1]).all()


def test_too_few_main_trials_fail_loudly(cleaned, answers, small_config):
    code = cleaned.codes()[0]
    short = cleaned.main[~((cleaned.main["participant_code"] == code) & (cleaned.main["trial_index"] > 20))]
    with pytest.raises(ValueError, match="at least 70 main trials"):
        run_learning_curves(short, answers, small_config)


# Output labelling


def test_synthetic_runs_are_labelled_everywhere(tmp_path: Path):
    run = Run(tmp_path, synthetic=True)
    table = run.write_table("demo", pd.DataFrame({"a_b": [1.5], "c": [">50"]}), "A caption with 50%")
    assert table.name == "SYNTHETIC_demo.csv"
    tex = (tmp_path / "tables" / "SYNTHETIC_demo.tex").read_text()
    assert "SYNTHETIC" in tex
    assert r"a\_b" in tex
    assert r"50\%" in tex
    report = Report(run, "Title")
    report.p("Body")
    path = report.write()
    assert path.name == "SYNTHETIC_report.html"
    assert "SYNTHETIC - Title" in path.read_text()
    assert "not real participants" in (tmp_path / "SYNTHETIC_report.md").read_text()


def test_real_runs_carry_no_synthetic_label(tmp_path: Path):
    run = Run(tmp_path, synthetic=False)
    assert run.write_table("demo", pd.DataFrame({"a": [1]}), "Caption").name == "demo.csv"
    report = Report(run, "Title")
    assert "SYNTHETIC" not in report.write().read_text()


def test_latex_escapes_special_characters():
    assert r"\textgreater{}50" in to_latex(pd.DataFrame({"k": [">50"]}), "x")
