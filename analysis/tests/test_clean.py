from __future__ import annotations

import io
from pathlib import Path

import pandas as pd

from conftest import rewrite_zip
from hci.clean import clean
from hci.io import load_export
from hci.platform import platform_info


def _edit_trials(source: Path, target: Path, fn) -> Path:
    def edit(name: str, text: str):
        if name != "comparison_trials.csv":
            return text
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        return fn(df).to_csv(index=False, lineterminator="\n")

    return rewrite_zip(source, target, edit)


def _rule(data, fragment: str):
    return next(e for e in data.log if fragment in e.rule)


def test_main_trials_exclude_practice_repeats_and_attention_checks(synthetic_zip: Path, config):
    data = clean(load_export(synthetic_zip), config, exclude_attention=False)
    assert data.main.groupby("participant_code").size().eq(70).all()
    assert not data.main["is_practice"].any()
    assert not data.main["is_repeat"].any()
    assert not data.main["is_attention_check"].any()
    assert _rule(data, "practice").count == 16 * platform_info()["design"]["practiceTrials"]


def test_main_trials_are_chronological(synthetic_zip: Path, config):
    data = clean(load_export(synthetic_zip), config)
    for _, group in data.main.groupby("participant_code"):
        assert group["seq"].is_monotonic_increasing


def test_repeats_match_the_original_trial_and_keep_the_gap(synthetic_zip: Path, config):
    export = load_export(synthetic_zip)
    data = clean(export, config, exclude_attention=False)
    assert data.repeats.groupby("participant_code").size().eq(10).all()
    assert (data.repeats["repeat_gap"] >= 20).all()
    trials = export.comparison_trials.set_index("trial_id")
    for row in data.repeats.itertuples():
        original, repeat = trials.loc[row.repeat_of_trial_id], trials.loc[row.trial_id]
        assert (original["left_clip_id"], original["right_clip_id"]) == (
            repeat["right_clip_id"],
            repeat["left_clip_id"],
        )
        assert row.consistent == int(original["chosen_clip_id"] == repeat["chosen_clip_id"])


def test_consistency_matches_the_platform_metric(synthetic_zip: Path, config):
    data = clean(load_export(synthetic_zip), config, exclude_attention=False)
    assert data.warnings == []
    expected = data.participants["consistency_pct"].astype(float) / 100
    assert ((data.participants["self_consistency"].astype(float) - expected).abs() < 0.001).all()


def test_half_uses_the_configured_boundary(synthetic_zip: Path, config):
    data = clean(load_export(synthetic_zip), config, exclude_attention=False)
    assert (data.repeats.loc[data.repeats["half"] == "first", "trial_index"] <= 41).all()
    assert (data.repeats.loc[data.repeats["half"] == "second", "trial_index"] > 41).all()


def test_attention_failure_is_excluded_or_kept_by_switch_and_always_logged(synthetic_zip: Path, tmp_path: Path, config):
    victim = "P3-003"

    def fail(df: pd.DataFrame) -> pd.DataFrame:
        row = df.index[(df["participant_code"] == victim) & (df["is_attention_check"] == "1")][0]
        df.loc[row, "choice"] = "left"
        df.loc[row, "chosen_clip_id"] = df.loc[row, "left_clip_id"]
        return df

    export = load_export(_edit_trials(synthetic_zip, tmp_path / "x.zip", fail))
    excluded = clean(export, config)
    assert victim not in excluded.codes()
    assert victim in _rule(excluded, "attention").ids
    assert _rule(excluded, "attention").action == "excluded"
    assert any("Attention failures differ" in w for w in excluded.warnings)  # participants.csv was not edited

    kept = clean(export, config, exclude_attention=False)
    assert victim in kept.codes()
    assert victim in _rule(kept, "attention").ids
    assert _rule(kept, "attention").action == "flagged"
    assert bool(kept.participants.set_index("participant_code").loc[victim, "attention_flag"]) is True


def test_fast_responses_are_flagged_and_kept_by_default(synthetic_zip: Path, tmp_path: Path, config):
    def fast(df: pd.DataFrame) -> pd.DataFrame:
        main = df.index[
            (df["is_practice"] == "0")
            & (df["is_repeat"] == "0")
            & (df["is_attention_check"] == "0")
            & (df["participant_code"] == "P3-001")
        ]
        df.loc[main[:5], "rt_ms"] = "100"
        return df

    export = load_export(_edit_trials(synthetic_zip, tmp_path / "x.zip", fast))
    flagged = clean(export, config, exclude_attention=False)
    assert _rule(flagged, "RT <").action == "flagged"
    assert _rule(flagged, "RT <").count >= 5
    assert (flagged.main["participant_code"] == "P3-001").sum() == 70

    strict = config.model_copy(deep=True)
    strict.cleaning.exclude_fast_rt = True
    assert (clean(export, strict, exclude_attention=False).main["participant_code"] == "P3-001").sum() <= 65


def test_incomplete_sessions_are_counted_not_silently_dropped(tmp_path: Path, config):
    from hci.simulate import simulate_export

    cfg = config.model_copy(deep=True)
    cfg.simulate.incomplete_participants = 2
    out = tmp_path / "synthetic_incomplete.zip"
    simulate_export(cfg, n=8, seed=3, out=out)
    data = clean(load_export(out), cfg, exclude_attention=False)
    entry = _rule(data, "not completed")
    assert entry.ids == ["P3-007", "P3-008"]
    assert "P3-007" not in data.codes()
    kept = cfg.model_copy(deep=True)
    kept.cleaning.require_completed_session = False
    assert _rule(clean(load_export(out), kept, exclude_attention=False), "unanswered").count > 0
