from __future__ import annotations

import json
import zipfile
from pathlib import Path

import numpy as np
import pytest

from hci.clean import clean
from hci.encoding import encode, num_changed
from hci.io import load_export
from hci.platform import platform_info
from hci.recovery import recovery_report
from hci.simulate import simulate_export

pytestmark = pytest.mark.node


def test_same_seed_gives_identical_bytes_and_a_new_seed_does_not(tmp_path: Path, config):
    a, b, c = tmp_path / "synthetic_a.zip", tmp_path / "synthetic_b.zip", tmp_path / "synthetic_c.zip"
    simulate_export(config, n=6, seed=5, out=a)
    simulate_export(config, n=6, seed=5, out=b)
    simulate_export(config, n=6, seed=6, out=c)
    assert a.read_bytes() == b.read_bytes()
    assert a.read_bytes() != c.read_bytes()
    assert a.with_suffix(".truth.json").read_bytes() == b.with_suffix(".truth.json").read_bytes()


def test_output_must_be_labelled_synthetic(tmp_path: Path, config):
    with pytest.raises(ValueError, match="SYNTHETIC"):
        simulate_export(config, n=6, seed=5, out=tmp_path / "study-export.zip")


def test_everything_is_labelled(synthetic_zip: Path, truth: dict):
    with zipfile.ZipFile(synthetic_zip) as archive:
        assert "SYNTHETIC" in archive.read("SYNTHETIC.txt").decode()
        assert "SYNTHETIC" in archive.read("codebook.md").decode()
    export = load_export(synthetic_zip)
    assert (export.participants["notes"] == "SYNTHETIC participant").all()
    assert truth["SYNTHETIC"] is True


def test_schedules_follow_the_platform_rules(synthetic_zip: Path):
    design = platform_info()["design"]
    trials = load_export(synthetic_zip).comparison_trials
    for _, t in trials.groupby("participant_code"):
        t = t.sort_values("seq")
        analysis = t[~t["is_practice"].astype(bool)]
        assert len(t[t["is_practice"].astype(bool)]) == design["practiceTrials"]
        assert len(analysis) == 82
        assert analysis["is_repeat"].astype(bool).sum() == design["repeatTrials"]
        assert analysis["is_attention_check"].astype(bool).sum() == design["attentionChecks"]
        main = analysis[~(analysis["is_repeat"].astype(bool) | analysis["is_attention_check"].astype(bool))]
        assert len(main) == 70
        assert len({frozenset(p) for p in zip(main["left_clip_id"], main["right_clip_id"], strict=True)}) == 70
        assert set(main["left_clip_id"]) | set(main["right_clip_id"]) <= set(platform_info()["clips"])
        checks = analysis[analysis["is_attention_check"].astype(bool)]
        assert (checks["left_clip_id"] == checks["right_clip_id"]).all()
        assert (
            checks["trial_index"]
            .between(design["attentionCheckMinPosition"], design["attentionCheckMaxPosition"])
            .all()
        )
        repeats = analysis[analysis["is_repeat"].astype(bool)]
        assert (repeats["repeat_gap"] >= design["repeatMinSpacing"]).all()
        assert (repeats["repeat_of_trial_index"] <= design["repeatSourceMaxPosition"]).all()


def test_setting_columns_and_busyness_match_the_clip_ids(synthetic_zip: Path):
    trials = load_export(synthetic_zip).comparison_trials.head(200)
    for row in trials.to_dict("records"):
        assert row["left_clip_id"].split("-")[0] == row["left_layout"]
        assert row["right_clip_id"].split("-")[4] == row["right_menu"]
        assert num_changed(row["left_clip_id"]) == row["left_numChangedSettings"]


def test_session_b_follows_the_latin_square_and_plan_format(synthetic_zip: Path, config, truth: dict):
    export = load_export(synthetic_zip)
    tasks = export.task_trials
    assert tasks.groupby("participant_code")["condition"].nunique().eq(4).all()
    assert tasks.groupby("participant_code")["task_id"].nunique().eq(4).all()
    assert set(tasks.groupby("participant_code").size()) == {4}
    position = tasks.groupby(["block_index", "condition"]).size()
    assert position.max() - position.min() <= 4  # with 16 people each condition fills each position equally
    assert position.nunique() == 1
    static = tasks[tasks["condition"] == "static"]
    assert (static["plan_steps"] == 0).all()
    assert (static["final_config_id"] == "list-default-detailed-light-sidebar").all()
    adaptive = tasks[tasks["condition"] != "static"]
    for snapshot in adaptive["plan_snapshot"]:
        steps = json.loads(snapshot)
        assert len(steps) == 1
        assert steps[0]["trigger"] == {"type": "afterMs", "value": config.plans.trigger_after_ms}
        assert 2 <= num_changed(steps[0]["config"]) <= 4


def test_rankings_are_a_permutation_per_participant(synthetic_zip: Path):
    ranks = load_export(synthetic_zip).rankings
    for _, r in ranks.groupby("participant_code"):
        assert sorted(r["rank"].tolist()) == [1, 2, 3, 4]


def test_questionnaire_items_come_from_the_platform_files_with_reverse_flags(synthetic_zip: Path):
    from hci.config import REPO_ROOT

    answers = load_export(synthetic_zip).questionnaire_task
    for instrument, group in answers.groupby("instrument"):
        file = json.loads(
            (REPO_ROOT / "content" / "questionnaires" / f"{instrument}.en.json").read_text(encoding="utf-8")
        )
        items = {i["id"]: i for i in file["items"]}
        assert set(group["item_id"]) == set(items)
        for row in group.dropna(subset=["value"]).head(200).to_dict("records"):
            item = items[row["item_id"]]
            assert item["scale"]["min"] <= row["value"] < item["scale"]["min"] + item["scale"]["points"]
            assert bool(row["reverse_coded"]) == item.get("reverse", False)


def test_reverse_coded_items_run_against_the_others(tmp_path: Path, config):
    out = tmp_path / "synthetic_reverse.zip"
    simulate_export(config, n=12, seed=2, out=out)
    answers = load_export(out).questionnaire_task
    ues = answers[answers["instrument"] == "ues_sf"].copy()
    ues["value"] = ues["value"].astype(float)
    wide = ues.pivot_table(
        index=["participant_code", "block_index"], columns="reverse_coded", values="value", aggfunc="mean"
    )
    assert np.corrcoef(wide[True].astype(float), wide[False].astype(float))[0, 1] < 0


def test_questionnaire_tracks_true_weights_imperfectly(synthetic_zip: Path, truth: dict):
    background = load_export(synthetic_zip).background.set_index("participant_code")
    true_w = {p["participant_code"]: np.array(p["w"]) for p in truth["participants"]}
    agree = []
    for code, w in true_w.items():
        answer = background.loc[code, "prefTheme"]
        if answer != "noPreference":
            agree.append((answer == "dark") == (w[6] > 0))
    assert 0.5 < np.mean(agree) <= 1.0


def test_truth_is_complete_and_consistent_with_the_export(synthetic_zip: Path, truth: dict):
    assert truth["n"] == 16
    assert len(truth["participants"]) == 16
    tasks = load_export(synthetic_zip).task_trials
    for person in truth["participants"]:
        assert len(person["w"]) == 8
        assert set(person["plan_targets"]) == set(platform_info()["conditions"])
        mine = tasks[tasks["participant_code"] == person["participant_code"]].set_index("condition")
        for condition, target in person["plan_targets"].items():
            assert mine.loc[condition, "final_config_id"] == target
        for block in person["session_b"]:
            assert block["utility"] == pytest.approx(float(encode(block["target"]) @ np.array(person["w"])))


def test_cluster5_worse_scenario_lowers_only_cluster5(tmp_path: Path, config):
    def means(scenario: str) -> dict[str, float]:
        out = tmp_path / f"synthetic_{scenario}.zip"
        truth = simulate_export(config, n=8, seed=4, out=out, scenario=scenario)
        rows = [b for p in truth["participants"] for b in p["session_b"]]
        return {
            c: float(np.mean([b["quis_latent"] for b in rows if b["condition"] == c]))
            for c in {b["condition"] for b in rows}
        }

    same, worse = means("equivalence"), means("cluster5_worse")
    assert worse["cluster5"] == pytest.approx(
        same["cluster5"] - config.simulate.session_b.scenarios["cluster5_worse"]["cluster5_shift"] * -1, abs=1e-9
    )
    for condition in ("static", "global", "personalFull"):
        assert worse[condition] == pytest.approx(same[condition])


def test_unknown_scenario_is_rejected(tmp_path: Path, config):
    with pytest.raises(ValueError, match="Unknown scenario"):
        simulate_export(config, n=6, seed=1, out=tmp_path / "synthetic_x.zip", scenario="nope")


def test_parameter_recovery_at_realistic_noise(tmp_path: Path, config):
    """Required by the brief: r > 0.8 on 50 comparisons. r cannot see a constant shift, so error is checked as well."""
    out = tmp_path / "synthetic_recovery.zip"
    simulate_export(config, n=32, seed=1, out=out)
    report = recovery_report(out, out.with_suffix(".truth.json"), config)
    at_50 = report["by_k"][50]
    assert at_50["mean_person_r"] > 0.8
    assert at_50["median_person_r"] > 0.8
    assert at_50["pooled_r"] > 0.8
    assert report["by_k"][70]["mean_person_r"] >= report["by_k"][5]["mean_person_r"]
    assert report["expected_consistency"]["p10"] >= 0.65
    assert report["expected_consistency"]["p90"] <= 0.97


def test_recovery_refuses_a_non_synthetic_truth_file(synthetic_zip: Path, tmp_path: Path, config):
    fake = tmp_path / "truth.json"
    fake.write_text(json.dumps({"SYNTHETIC": False}))
    with pytest.raises(ValueError, match="not SYNTHETIC"):
        recovery_report(synthetic_zip, fake, config)


def test_validate_reports_real_trial_counts(synthetic_zip: Path, config):
    data = clean(load_export(synthetic_zip), config, exclude_attention=False)
    assert len(data.main) == 16 * 70
    assert len(data.repeats) == 16 * 10
