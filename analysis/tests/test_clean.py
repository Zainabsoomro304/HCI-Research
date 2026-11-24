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
    data = clean(load_export(synthetic_zip), config)
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
    data = clean(export, config)
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
    data = clean(load_export(synthetic_zip), config)
    assert data.warnings == []
    expected = data.participants["consistency_pct"].astype(float) / 100
    assert ((data.participants["self_consistency"].astype(float) - expected).abs() < 0.001).all()


def test_half_uses_the_configured_boundary(synthetic_zip: Path, config):
    data = clean(load_export(synthetic_zip), config)
    assert (data.repeats.loc[data.repeats["half"] == "first", "trial_index"] <= 40).all()
    assert (data.repeats.loc[data.repeats["half"] == "second", "trial_index"] > 40).all()


def test_attention_check_trials_never_exclude_anyone(synthetic_zip: Path, tmp_path: Path, config):
    """Older sessions had 2 attention checks. A wrong answer on one must not exclude or flag anybody."""
    victim = "P-S003"

    def mark(df: pd.DataFrame) -> pd.DataFrame:
        row = df.index[(df["participant_code"] == victim) & (df["is_repeat"] == "0") & (df["is_practice"] == "0")][-1]
        df.loc[row, "is_attention_check"] = "1"
        df.loc[row, "right_clip_id"] = df.loc[row, "left_clip_id"]
        df.loc[row, "choice"] = "left"
        df.loc[row, "chosen_clip_id"] = df.loc[row, "left_clip_id"]
        return df

    data = clean(load_export(_edit_trials(synthetic_zip, tmp_path / "x.zip", mark)), config)
    assert victim in data.codes()
    assert not any("attention" in e.rule for e in data.log)
    assert not data.main["is_attention_check"].astype(bool).any()


def test_fast_responses_are_flagged_and_kept_by_default(synthetic_zip: Path, tmp_path: Path, config):
    def fast(df: pd.DataFrame) -> pd.DataFrame:
        main = df.index[
            (df["is_practice"] == "0")
            & (df["is_repeat"] == "0")
            & (df["is_attention_check"] == "0")
            & (df["participant_code"] == "P-S001")
        ]
        df.loc[main[:5], "rt_ms"] = "100"
        return df

    export = load_export(_edit_trials(synthetic_zip, tmp_path / "x.zip", fast))
    flagged = clean(export, config)
    assert _rule(flagged, "RT <").action == "flagged"
    assert _rule(flagged, "RT <").count >= 5
    assert (flagged.main["participant_code"] == "P-S001").sum() == 70

    strict = config.model_copy(deep=True)
    strict.cleaning.exclude_fast_rt = True
    assert (clean(export, strict).main["participant_code"] == "P-S001").sum() <= 65


def test_incomplete_sessions_are_counted_not_silently_dropped(tmp_path: Path, config):
    from hci.simulate import simulate_export

    cfg = config.model_copy(deep=True)
    cfg.simulate.incomplete_participants = 2
    out = tmp_path / "synthetic_incomplete.zip"
    simulate_export(cfg, n=8, seed=3, out=out)
    data = clean(load_export(out), cfg)
    entry = _rule(data, "not completed")
    assert entry.ids == ["P-S007", "P-S008"]
    assert "P-S007" not in data.codes()
    kept = cfg.model_copy(deep=True)
    kept.cleaning.require_completed_session = False
    assert _rule(clean(load_export(out), kept), "unanswered").count > 0


def test_earlier_protocol_participants_are_flagged_and_can_be_left_out(synthetic_zip: Path, tmp_path: Path, config):
    def flag(name: str, text: str):
        if name != "participants.csv":
            return text
        frame = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        frame.loc[frame["participant_code"] == "P-S003", "protocol"] = "earlier-version"
        return frame.to_csv(index=False, lineterminator="\n")

    export = load_export(rewrite_zip(synthetic_zip, tmp_path / "x.zip", flag))
    kept = clean(export, config)
    entry = next(e for e in kept.log if e.rule == "earlier protocol version")
    assert (entry.action, entry.ids) == ("flagged", ["P-S003"])
    assert "P-S003" in kept.codes()
    left_out = clean(export, config, exclude_earlier_protocol=True)
    assert "P-S003" not in left_out.codes()
    assert next(e for e in left_out.log if e.rule == "earlier protocol version").action == "excluded"
