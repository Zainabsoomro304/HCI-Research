from __future__ import annotations

import numpy as np
import pytest

from hci.encoding import (
    ALL_CONFIG_IDS,
    ALL_NUM_CHANGED,
    ALL_X,
    BASE_CONFIG_ID,
    FEATURES,
    SETTINGS,
    decode,
    eligible_mask,
    encode,
    num_changed,
)
from hci.platform import platform_info


def test_there_are_432_unique_configs_and_10_features():
    assert len(ALL_CONFIG_IDS) == len(set(ALL_CONFIG_IDS)) == 432
    assert FEATURES == (
        "textSize.large", "textSize.xlarge", "targetSize.large", "buttonStyle.outlined", "buttonStyle.raised",
        "iconLabels.iconText", "contrast.high", "layout.grid2", "layout.list", "guidance.hints",
    )  # fmt: skip
    assert len({tuple(x) for x in ALL_X}) == 432


@pytest.mark.parametrize("config_id", ALL_CONFIG_IDS)
def test_round_trip(config_id):
    assert decode(encode(config_id)) == config_id


def test_base_config_encodes_to_zero_and_matches_the_platform():
    assert BASE_CONFIG_ID == platform_info()["baseConfigId"] == "standard-standard-flat-iconOnly-standard-grid3-none"
    assert encode(BASE_CONFIG_ID).sum() == 0
    assert num_changed(BASE_CONFIG_ID) == 0


def test_levels_match_the_platform():
    levels = platform_info()["settingLevels"]
    assert tuple(SETTINGS) == tuple(platform_info()["settingKeys"])
    for setting, ours in SETTINGS.items():
        assert list(ours) == list(levels[setting])  # same order: the first level is the base on both sides


@pytest.mark.parametrize("bad", ["standard-standard-flat-iconOnly-standard-grid3", "huge-standard-flat-iconOnly-standard-grid3-none", ""])
def test_invalid_ids_are_rejected(bad):
    with pytest.raises(ValueError):
        encode(bad)


def test_invalid_vectors_are_rejected():
    x = encode(BASE_CONFIG_ID)
    x[0] = x[1] = 1  # two text sizes at once
    with pytest.raises(ValueError):
        decode(x)


def test_number_of_changes_is_the_sum_of_the_dummies():
    for config_id, x, changed in zip(ALL_CONFIG_IDS, ALL_X, ALL_NUM_CHANGED, strict=True):
        base = BASE_CONFIG_ID.split("-")
        assert changed == x.sum() == sum(a != b for a, b in zip(config_id.split("-"), base, strict=True))


def test_eligible_targets_exclude_the_base_and_extremes():
    mask = eligible_mask(2, 4)
    assert not mask[ALL_CONFIG_IDS.index(BASE_CONFIG_ID)]
    assert set(ALL_NUM_CHANGED[mask]) == {2, 3, 4}
    # The counts come from expanding (1 + 2t)^3 (1 + t)^4: three 3-level and four 2-level settings.
    assert np.bincount(ALL_NUM_CHANGED).tolist() == [1, 10, 42, 96, 129, 102, 44, 8]
    assert mask.sum() == 42 + 96 + 129
