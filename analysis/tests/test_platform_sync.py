"""Fails when the platform's definitions change without this pipeline being updated."""

from __future__ import annotations

import json

import pytest

from hci.node import run_tsx
from hci.platform import platform_info

pytestmark = pytest.mark.node


def test_snapshot_matches_the_platform_code():
    assert json.loads(run_tsx("analysis-platform-info.ts")) == platform_info()


def test_config_agrees_with_the_platform(config):
    info = platform_info()
    assert config.cleaning.max_failed_attention_checks == info["maxFailedAttentionChecks"]
    design = info["design"]
    assert (
        config.cleaning.fatigue_half_boundary
        == (design["mainTrials"] + design["repeatTrials"] + design["attentionChecks"]) // 2
    )
