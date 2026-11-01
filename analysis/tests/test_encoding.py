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


def test_there_are_108_unique_configs_and_8_features():
    assert len(ALL_CONFIG_IDS) == len(set(ALL_CONFIG_IDS)) == 108
    assert FEATURES == ("grid2", "grid3", "small", "large", "partial", "summary", "dark", "dropdown")
    assert len({tuple(x) for x in ALL_X}) == 108


@pytest.mark.parametrize("config_id", ALL_CONFIG_IDS)
def test_round_trip(config_id):
    assert decode(encode(config_id)) == config_id


def test_base_config_encodes_to_zero_and_matches_the_platform():
    assert BASE_CONFIG_ID == platform_info()["baseConfigId"] == "list-default-detailed-light-sidebar"
    assert encode(BASE_CONFIG_ID).sum() == 0
    assert num_changed(BASE_CONFIG_ID) == 0


def test_levels_match_the_platform():
    levels = platform_info()["settingLevels"]
    assert tuple(SETTINGS) == tuple(platform_info()["settingKeys"])
    for setting, ours in SETTINGS.items():
        assert set(ours) == set(levels[setting])


@pytest.mark.parametrize("bad", ["list-default-detailed-light", "table-default-detailed-light-sidebar", ""])
def test_invalid_ids_are_rejected(bad):
    with pytest.raises(ValueError):
        encode(bad)


def test_invalid_vectors_are_rejected():
    x = encode(BASE_CONFIG_ID)
    x[0] = x[1] = 1  # two layouts at once
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
    # 1 base, 8 with one change and 8 * ... : the counts come from expanding (1 + 2t)^3 (1 + t)^2
    assert np.bincount(ALL_NUM_CHANGED).tolist() == [1, 8, 25, 38, 28, 8]
    assert mask.sum() == 25 + 38 + 28
