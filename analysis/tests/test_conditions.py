"""The one-group design hinges on these: a participant's own data must never reach their global or cluster model."""

from __future__ import annotations

from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest

from hci.clean import clean
from hci.conditions import condition_models, condition_targets, restricted_argmax, unrestricted_argmax
from hci.encoding import ALL_CONFIG_IDS, BASE_CONFIG_ID, num_changed
from hci.io import load_export
from hci.model import Comparisons, by_participant


@pytest.fixture(scope="module")
def people(synthetic_zip: Path, config) -> dict[str, Comparisons]:
    return by_participant(clean(load_export(synthetic_zip), config, exclude_attention=False).main)


def _models(code: str, people: dict[str, Comparisons], config):
    return condition_models(code, people, sigma=2.0, use_curvature=True, config=config)


def _flipped(data: Comparisons) -> Comparisons:
    return replace(data, y=1 - data.y)


def test_held_out_persons_data_never_changes_their_shared_models(people, config):
    code = "P3-004"
    original = _models(code, people, config)
    changed = _models(code, {**people, code: _flipped(people[code])}, config)
    assert original.nuisance == changed.nuisance
    assert np.array_equal(original.global_w, changed.global_w)
    assert np.array_equal(original.cluster_weights, changed.cluster_weights)
    assert not np.allclose(original.personal_w, changed.personal_w)  # their own model does change


def test_removing_the_person_entirely_gives_the_same_shared_models(people, config):
    """Shared models computed for P3-004 are unaffected by P3-004's existence, but do depend on everyone else."""
    code = "P3-004"
    base = _models(code, people, config)
    other = "P3-005"
    changed = _models(code, {**people, other: _flipped(people[other])}, config)
    assert not np.array_equal(base.global_w, changed.global_w)


def test_cluster_assignment_and_fine_tuning_only_use_the_first_five_comparisons(people, config):
    code = "P3-004"
    data = people[code]
    later_flipped = np.concatenate([data.y[:5], 1 - data.y[5:]])
    original = _models(code, people, config)
    changed = _models(code, {**people, code: replace(data, y=later_flipped)}, config)
    assert original.cluster5_assigned == changed.cluster5_assigned
    assert np.array_equal(original.cluster5_w, changed.cluster5_w)


def test_first_five_comparisons_do_change_the_fine_tuned_model(people, config):
    code = "P3-004"
    data = people[code]
    early_flipped = np.concatenate([1 - data.y[:5], data.y[5:]])
    assert not np.array_equal(
        _models(code, people, config).cluster5_w,
        _models(code, {**people, code: replace(data, y=early_flipped)}, config).cluster5_w,
    )


def test_cluster_counts_stay_in_the_allowed_range(people, config):
    assert _models("P3-001", people, config).cluster_k in config.clusters.candidates


def test_targets_are_restricted_and_static_stays_at_base(people, config):
    targets = condition_targets(
        _models("P3-001", people, config), config.targets.min_changed, config.targets.max_changed
    )
    assert targets["static"] == BASE_CONFIG_ID
    for condition in ("global", "cluster5", "personalFull"):
        assert 2 <= num_changed(targets[condition]) <= 4


def test_restriction_changes_the_argmax_when_the_best_config_is_outside_the_range():
    all_positive = np.full(8, 1.0)
    assert num_changed(unrestricted_argmax(all_positive)) == 5
    assert num_changed(restricted_argmax(all_positive, 2, 4)) == 4
    all_negative = np.full(8, -1.0)
    assert unrestricted_argmax(all_negative) == BASE_CONFIG_ID
    assert num_changed(restricted_argmax(all_negative, 2, 4)) == 2
    assert restricted_argmax(all_positive, 2, 4) in ALL_CONFIG_IDS
