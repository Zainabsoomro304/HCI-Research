from __future__ import annotations

import io
from pathlib import Path

import pandas as pd
import pytest

from conftest import rewrite_zip
from hci.config import ANALYSIS_DIR
from hci.io import ExportError, load_export
from hci.platform import platform_info


def test_loads_typed_tables(synthetic_zip: Path):
    export = load_export(synthetic_zip)
    assert export.synthetic is True
    assert len(export.participants) == 16
    trials = export.comparison_trials
    assert trials["rt_ms"].dtype == "Int64"
    assert trials["is_repeat"].dtype == "boolean"
    assert pd.api.types.is_datetime64_any_dtype(trials["client_shown_at"])
    assert len(export.sha256) == 64


def test_columns_are_exactly_the_platform_columns(synthetic_zip: Path):
    export = load_export(synthetic_zip)
    schema = platform_info()["tables"]
    assert list(export.participants.columns) == schema["participants.csv"]
    assert list(export.comparison_trials.columns) == schema["comparison_trials.csv"]
    assert list(export.questionnaire_task.columns) == schema["questionnaire_task.csv"]


def test_missing_column_is_named(synthetic_zip: Path, tmp_path: Path):
    def drop_rt(name: str, text: str):
        if name != "comparison_trials.csv":
            return text
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        return df.drop(columns=["rt_ms"]).to_csv(index=False, lineterminator="\n")

    with pytest.raises(ExportError, match=r"missing column: rt_ms"):
        load_export(rewrite_zip(synthetic_zip, tmp_path / "x.zip", drop_rt))


def test_renamed_column_suggests_the_new_name(synthetic_zip: Path, tmp_path: Path):
    def rename(name: str, text: str):
        return text.replace("repeat_of_trial_id", "repeat_of_trial_ids", 1) if name == "comparison_trials.csv" else text

    with pytest.raises(ExportError) as e:
        load_export(rewrite_zip(synthetic_zip, tmp_path / "x.zip", rename))
    assert "missing column: repeat_of_trial_id (renamed to repeat_of_trial_ids?)" in str(e.value)
    assert "unexpected column: repeat_of_trial_ids" in str(e.value)


def test_missing_file_is_named(synthetic_zip: Path, tmp_path: Path):
    def drop(name: str, text: str):
        return None if name == "rankings.csv" else text

    with pytest.raises(ExportError, match="rankings.csv"):
        load_export(rewrite_zip(synthetic_zip, tmp_path / "x.zip", drop))


def test_unreadable_cell_names_its_column(synthetic_zip: Path, tmp_path: Path):
    def corrupt(name: str, text: str):
        if name != "comparison_trials.csv":
            return text
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        df.loc[df.index[10], "rt_ms"] = "soon"
        return df.to_csv(index=False, lineterminator="\n")

    with pytest.raises(ExportError, match="column rt_ms"):
        load_export(rewrite_zip(synthetic_zip, tmp_path / "x.zip", corrupt))


def test_inconsistent_choice_is_rejected(synthetic_zip: Path, tmp_path: Path):
    def corrupt(name: str, text: str):
        if name != "comparison_trials.csv":
            return text
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        row = df.index[(df["is_attention_check"] == "0") & (df["choice"] == "left")][0]
        df.loc[row, "chosen_clip_id"] = df.loc[row, "right_clip_id"]
        return df.to_csv(index=False, lineterminator="\n")

    with pytest.raises(ExportError, match="chosen_clip_id does not match choice"):
        load_export(rewrite_zip(synthetic_zip, tmp_path / "x.zip", corrupt))


def test_not_a_zip(tmp_path: Path):
    path = tmp_path / "export.zip"
    path.write_text("nope")
    with pytest.raises(ExportError, match="not a ZIP"):
        load_export(path)


def test_marker_decides_synthetic_even_if_the_file_is_renamed(synthetic_zip: Path, tmp_path: Path):
    renamed = rewrite_zip(synthetic_zip, tmp_path / "study-export-phase3.zip", lambda name, text: text)
    assert load_export(renamed).synthetic is True
    unmarked = rewrite_zip(
        synthetic_zip, tmp_path / "y.zip", lambda name, text: None if name == "SYNTHETIC.txt" else text
    )
    assert load_export(unmarked).synthetic is False


DEMO_EXPORT = ANALYSIS_DIR / "data" / "demo_export.zip"


@pytest.mark.skipif(
    not DEMO_EXPORT.exists(), reason="optional: an export downloaded from the local platform's demo data"
)
def test_a_real_platform_export_loads():
    export = load_export(DEMO_EXPORT)
    assert export.synthetic is False
    assert len(export.participants) > 0
    assert export.comparison_trials["choice"].notna().any()
