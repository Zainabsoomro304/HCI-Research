from __future__ import annotations

import io
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from conftest import rewrite_zip
from hci.clean import clean
from hci.io import load_export
from hci.phase3 import build_blocks, read_instrument, run_phase3, score_questionnaires
from hci.platform import platform_info
from hci.power import power_table, required_n, tost_power
from hci.prereg import build_prereg
from hci.rstats import run_r
from hci.simulate import simulate_export
from hci.summary import build_index


def _answers(rows: list[dict]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    frame["instrument_version"] = "x#SYNTHETIC"
    frame["reverse_coded"] = frame.get("reverse_coded", False)
    return frame


def test_reverse_coded_items_are_flipped_and_na_left_out():
    file, _ = read_instrument("ues_sf")
    reverse = next(i for i in file["items"] if i["reverse"])
    forward = next(i for i in file["items"] if not i["reverse"])
    assert (reverse["scale"]["min"], reverse["scale"]["points"]) == (1, 5)
    wide, _, _ = score_questionnaires(
        _answers(
            [
                {
                    "participant_code": "a",
                    "block_index": 0,
                    "instrument": "ues_sf",
                    "item_id": reverse["id"],
                    "value": 1.0,
                    "reverse_coded": True,
                },
                {
                    "participant_code": "a",
                    "block_index": 0,
                    "instrument": "ues_sf",
                    "item_id": forward["id"],
                    "value": 4.0,
                    "reverse_coded": False,
                },
                {
                    "participant_code": "b",
                    "block_index": 0,
                    "instrument": "ues_sf",
                    "item_id": forward["id"],
                    "value": np.nan,
                    "reverse_coded": False,
                },
                {
                    "participant_code": "b",
                    "block_index": 0,
                    "instrument": "ues_sf",
                    "item_id": reverse["id"],
                    "value": 5.0,
                    "reverse_coded": True,
                },
            ]
        )
    )
    scores = wide.set_index("participant")["ues_sf"]
    assert scores["a"] == pytest.approx((5 + 4) / 2)
    assert scores["b"] == pytest.approx(1)


def test_items_not_in_the_instrument_file_fail_loudly():
    with pytest.raises(ValueError, match="not in the instrument file"):
        score_questionnaires(
            _answers(
                [{"participant_code": "a", "block_index": 0, "instrument": "quis", "item_id": "made_up", "value": 3.0}]
            )
        )


def test_placeholder_items_and_stale_versions_are_reported():
    file, _ = read_instrument("quis")
    frame = _answers(
        [
            {
                "participant_code": "a",
                "block_index": 0,
                "instrument": "quis",
                "item_id": file["items"][0]["id"],
                "value": 3.0,
            }
        ]
    )
    frame["instrument_version"] = "old#abc"
    _, _, notes = score_questionnaires(frame)
    assert any("placeholder" in n for n in notes)
    assert any("old#abc" in n for n in notes)


def test_task_success_needs_all_items_and_the_budget(synthetic_zip: Path, config):
    export = load_export(synthetic_zip)
    people = clean(export, config).codes()
    required = platform_info()["tasks"][0]["requiredItems"]
    blocks, _, _ = build_blocks(export, people, required)
    tasks = export.task_trials.set_index(["participant_code", "block_index"])
    for row in blocks.head(40).to_dict("records"):
        source = tasks.loc[(row["participant"], row["block_index"])]
        assert row["success"] == int(source["required_items_found"] == required and bool(source["within_budget"]))
    assert set(blocks["condition"]) == {"static", "global", "cluster5", "personalFull"}
    assert blocks["quis"].between(0, 9).all()
    assert blocks["ues"].between(1, 5).all()


# TOST on simulated equivalent and non-equivalent data


def _blocks(n: int, shift: float, seed: int) -> pd.DataFrame:
    """A clean Latin-square data set with a known cluster5 - personalFull difference."""
    rng = np.random.default_rng(seed)
    conditions = ["static", "global", "cluster5", "personalFull"]
    rows = []
    for i in range(n):
        person = rng.normal(0, 0.7)
        for position in range(4):
            condition = conditions[(i + position) % 4]
            effect = {"static": -0.8, "global": -0.2, "cluster5": shift, "personalFull": 0.0}[condition]
            quis = 5.5 + person + effect + rng.normal(0, 0.5)
            rows.append(
                {
                    "participant": f"p{i}",
                    "language": ["en", "ur"][(i // 8) % 2],
                    "condition": condition,
                    "position": position,
                    "block_index": position,
                    "task": ["a", "b", "c", "d"][(i // 4 + position) % 4],
                    "log_time": 5 + rng.normal(0, 0.3),
                    "items_found": 6.0,
                    "success": int(rng.random() < 0.8),
                    "target": condition,
                    "quis": quis,
                    "ues": 3 + rng.normal(0, 0.5),
                }
            )
    return pd.DataFrame(rows)


def _run_r_models(blocks: pd.DataFrame, directory: Path) -> pd.DataFrame:
    directory.mkdir(parents=True, exist_ok=True)
    ranks = blocks[["participant", "condition"]].copy()
    ranks["rank"] = blocks.groupby("participant")["quis"].rank(ascending=False, method="first").astype(int)
    blocks.to_csv(directory / "blocks.csv", index=False)
    ranks.to_csv(directory / "ranks.csv", index=False)
    run_r("phase3_models.R", str(directory / "blocks.csv"), str(directory / "ranks.csv"), str(directory), "0.5")
    return pd.read_csv(directory / "tost.csv")


def test_tost_finds_equivalence_when_conditions_match(tmp_path: Path):
    tost = _run_r_models(_blocks(32, 0.0, 1), tmp_path)
    row = tost.iloc[0]
    assert row["source"] == "LMM contrast"
    assert bool(row["equivalent"]) is True
    assert row["p_tost"] == pytest.approx(max(row["p_lower"], row["p_upper"]))
    assert -0.5 < row["ci90_low"] < row["ci90_high"] < 0.5
    assert tost.iloc[1]["source"] == "TOSTER paired means"


def test_tost_rejects_equivalence_when_cluster5_is_clearly_worse(tmp_path: Path):
    row = _run_r_models(_blocks(32, -1.0, 2), tmp_path).iloc[0]
    assert bool(row["equivalent"]) is False
    assert row["ci90_high"] < 0


def test_tost_does_not_claim_equivalence_for_a_difference_at_the_margin(tmp_path: Path):
    row = _run_r_models(_blocks(32, -0.5, 3), tmp_path).iloc[0]
    assert bool(row["equivalent"]) is False


def test_contrasts_recover_a_known_effect(tmp_path: Path):
    _run_r_models(_blocks(32, 0.0, 4), tmp_path)
    contrasts = pd.read_csv(tmp_path / "contrasts.csv")
    quis = contrasts[contrasts["outcome"] == "quis"].set_index("contrast")
    assert quis.loc["personalFull - static", "estimate"] == pytest.approx(0.8, abs=0.25)
    assert quis.loc["personalFull - static", "p_holm"] < 0.05
    assert (quis["p_holm"] >= quis["p"]).all()
    assert len(quis) == 4


# The whole Phase 3 run


def test_full_phase3_report_on_a_synthetic_export(tmp_path: Path, config):
    out = tmp_path / "synthetic_phase3.zip"
    simulate_export(config, n=16, seed=5, out=out)
    path = run_phase3(out, config, output_root=tmp_path / "output")
    assert path.name == "SYNTHETIC_report.html"
    html = path.read_text(encoding="utf-8")
    assert "SYNTHETIC" in html
    assert "not real participants" in html
    assert "Estimation is primary" in html  # N = 16 is below 32
    assert "rq5" not in html.lower()  # no subgroup analyses
    assert "language" in html.lower()
    run = path.parent
    assert (run / "tables" / "SYNTHETIC_h4b_tost.csv").exists()
    assert (run / "figures" / "SYNTHETIC_condition_means.pdf").exists()
    assert json.loads((run / "SYNTHETIC_run_manifest.json").read_text())["synthetic"] is True


def test_phase3_reports_clearly_when_there_is_no_session_b(synthetic_zip: Path, tmp_path: Path, config):
    def clear(name: str, text: str):
        if name != "participants.csv":
            return text
        frame = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        frame["sessionB_status"] = "not_started"
        return frame.to_csv(index=False, lineterminator="\n")

    with pytest.raises(ValueError, match="No participant has completed Session B"):
        run_phase3(rewrite_zip(synthetic_zip, tmp_path / "x.zip", clear), config, output_root=tmp_path)


# Power


def test_power_rises_with_n_and_falls_with_a_true_difference():
    rng = np.random.default_rng(1)
    low = tost_power(16, 1.0, 0.5, 0.5, 0.0, 4000, rng)
    high = tost_power(48, 1.0, 0.5, 0.5, 0.0, 4000, rng)
    shifted = tost_power(48, 1.0, 0.5, 0.5, 0.25, 4000, rng)
    assert low < high
    assert shifted < high


def test_power_matches_the_hand_calculation():
    """SD of differences 1, N = 36: non-central t theory gives about 0.80."""
    rng = np.random.default_rng(2)
    assert tost_power(36, 1.0, 0.5, 0.5, 0.0, 20000, rng) == pytest.approx(0.80, abs=0.03)


def test_tost_false_positive_rate_is_at_most_alpha_at_the_margin():
    rng = np.random.default_rng(3)
    assert tost_power(32, 1.0, 0.5, 0.5, 0.5, 20000, rng) <= 0.06


def test_power_table_covers_16_and_32_and_is_deterministic(config):
    cfg = config.model_copy(deep=True)
    cfg.power.simulations = 200
    first = power_table(cfg)
    assert {16, 32} <= set(first["n"])
    pd.testing.assert_frame_equal(first, power_table(cfg))
    assert set(required_n(first, 0.8).columns) >= {"sd", "correlation", "n_needed"}


# Prereg, loader and index


def test_prereg_comes_from_the_config_and_marks_open_items(config):
    cfg = config.model_copy(deep=True)
    cfg.power.simulations = 200
    text = build_prereg(cfg)
    assert "[confirm]" in text
    assert f"±{cfg.phase3.equivalence_margin:g}" in text
    assert "N = 16" in text
    assert "N = 32" in text
    assert "leave-one-out" in text
    cfg.phase3.equivalence_margin = 0.75
    assert "±0.75" in build_prereg(cfg)


def test_export_with_simulated_participants_counts_as_synthetic(synthetic_zip: Path, tmp_path: Path):
    unmarked = rewrite_zip(
        synthetic_zip, tmp_path / "x.zip", lambda name, text: None if name == "SYNTHETIC.txt" else text
    )
    assert load_export(unmarked).synthetic is True  # is_simulated = 1 still gives it away


def test_loader_reads_the_new_files(synthetic_zip: Path):
    export = load_export(synthetic_zip)
    assert len(export.plans) == 16
    assert "target_personalFull" in export.plans.columns
    assert isinstance(export.frozen_model, dict)
    assert len(export.admin_actions) == 0


def test_withdrawn_participants_are_excluded_and_logged(synthetic_zip: Path, tmp_path: Path, config):
    def withdraw(name: str, text: str):
        if name != "participants.csv":
            return text
        frame = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        frame.loc[frame["participant_code"] == "P3-002", "withdrawn_at"] = "2026-01-01T00:00:00.000Z"
        return frame.to_csv(index=False, lineterminator="\n")

    data = clean(load_export(rewrite_zip(synthetic_zip, tmp_path / "x.zip", withdraw)), config)
    assert "P3-002" not in data.codes()
    assert next(e for e in data.log if e.rule == "withdrawn").ids == ["P3-002"]


def test_index_page_is_labelled_when_it_links_synthetic_runs(tmp_path: Path, monkeypatch):
    import hci.summary

    run = tmp_path / "output" / "SYNTHETIC_phase2_abc_def"
    run.mkdir(parents=True)
    (run / "SYNTHETIC_report.html").write_text("x")
    monkeypatch.setattr(hci.summary, "ANALYSIS_DIR", tmp_path)
    path = build_index()
    assert path.name == "SYNTHETIC_index.html"
    assert "SYNTHETIC" in path.read_text()
