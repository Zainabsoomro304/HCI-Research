"""Loads the admin-panel export ZIP into typed DataFrames, validated against the platform's column definitions.

The only input to the pipeline. Fails loudly on missing or renamed columns, unparsable cells and impossible values.
"""

from __future__ import annotations

import difflib
import hashlib
import io
import zipfile
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from hci.encoding import encode
from hci.platform import platform_info

SYNTHETIC_MARKER = "SYNTHETIC.txt"

_BOOL = {
    "is_practice",
    "is_repeat",
    "is_attention_check",
    "attention_failed",
    "within_budget",
    "is_na",
    "reverse_coded",
}
_FLOAT = {"consistency_pct", "value"}
_INT = {
    "study_phase", "number", "seed", "condition_row", "task_row", "attention_total", "attention_correct",
    "repeats_answered", "repeats_consistent", "age", "techConfidence", "seq", "trial_index", "repeat_of_trial_index",
    "repeat_gap", "left_numChangedSettings", "right_numChangedSettings", "rt_ms", "replay_count", "after_trial_index",
    "duration_ms", "block_index", "interface_number", "budget", "required_items_found", "total_spent", "extra_items",
    "plan_steps", "applied_steps", "rank", "event_id", "client_ts_ms",
}  # fmt: skip
_DATETIME_EXACT = {"client_ts", "server_ts"}

_DOMAINS: dict[str, dict[str, set[str]]] = {
    "participants.csv": {"group": {"cs", "nonCs", "unknown"}},
    "comparison_trials.csv": {"choice": {"left", "right"}, "group": {"cs", "nonCs", "unknown"}},
    "task_trials.csv": {"condition": {"static", "global", "cluster5", "personalFull", "practice"}},
    "questionnaire_task.csv": {"instrument": {"quis", "ues_sf"}},
    "rankings.csv": {"condition": {"static", "global", "cluster5", "personalFull"}},
}


class ExportError(ValueError):
    """The export does not match what this pipeline expects."""


@dataclass
class Export:
    participants: pd.DataFrame
    background: pd.DataFrame
    comparison_trials: pd.DataFrame
    breaks: pd.DataFrame
    task_trials: pd.DataFrame
    questionnaire_task: pd.DataFrame
    rankings: pd.DataFrame
    events: pd.DataFrame
    codebook: str
    synthetic: bool
    path: Path
    sha256: str


def _column_kind(name: str) -> str:
    if name in _BOOL:
        return "bool"
    if name in _INT:
        return "int"
    if name in _FLOAT:
        return "float"
    if name.endswith("_at") or name in _DATETIME_EXACT:
        return "datetime"
    return "string"


def _check_columns(file: str, found: list[str], expected: list[str]) -> None:
    missing = [c for c in expected if c not in found]
    unexpected = [c for c in found if c not in expected]
    if not missing and not unexpected:
        return
    lines = [f"{file} does not match the platform's column definitions."]
    for col in missing:
        close = difflib.get_close_matches(col, unexpected, n=1, cutoff=0.6)
        lines.append(f"  missing column: {col}" + (f" (renamed to {close[0]}?)" if close else ""))
    lines.extend(f"  unexpected column: {col}" for col in unexpected)
    lines.append("If the platform changed, refresh platform_info.json from scripts/analysis-platform-info.ts.")
    raise ExportError("\n".join(lines))


def _coerce(file: str, df: pd.DataFrame) -> pd.DataFrame:
    out = {}
    for col in df.columns:
        raw = df[col].where(df[col] != "", pd.NA)
        kind = _column_kind(col)
        try:
            if kind == "bool":
                bad = set(raw.dropna().unique()) - {"0", "1"}
                if bad:
                    raise ValueError(f"expected 1/0, found {sorted(bad)[:3]}")
                out[col] = raw.map({"1": True, "0": False}, na_action="ignore").astype("boolean")
            elif kind == "int":
                out[col] = pd.to_numeric(raw).astype("Int64")
            elif kind == "float":
                out[col] = pd.to_numeric(raw).astype("Float64")
            elif kind == "datetime":
                out[col] = pd.to_datetime(raw, format="ISO8601", utc=True)
            else:
                out[col] = raw.astype("string")
        except (ValueError, TypeError) as e:
            raise ExportError(f"{file}: column {col} cannot be read as {kind}: {e}") from e
    return pd.DataFrame(out, index=df.index)


def _check_domains(file: str, df: pd.DataFrame) -> None:
    for col, allowed in _DOMAINS.get(file, {}).items():
        bad = set(df[col].dropna().unique()) - allowed
        if bad:
            raise ExportError(f"{file}: column {col} has unexpected values {sorted(bad)}")


def _check_trials(df: pd.DataFrame) -> None:
    for side in ("left", "right"):
        for clip in df[f"{side}_clip_id"].dropna().unique():
            try:
                encode(clip)
            except ValueError as e:
                raise ExportError(f"comparison_trials.csv: {e}") from e
    answered = df[df["choice"].notna()]
    expected = answered["left_clip_id"].where(answered["choice"] == "left", answered["right_clip_id"])
    bad = answered[answered["chosen_clip_id"] != expected]
    if len(bad):
        raise ExportError(f"comparison_trials.csv: {len(bad)} trials where chosen_clip_id does not match choice")
    orphans = df["repeat_of_trial_id"].dropna()
    orphans = orphans[~orphans.isin(set(df["trial_id"]))]
    if len(orphans):
        raise ExportError(
            f"comparison_trials.csv: {len(orphans)} repeats whose repeat_of_trial_id is not in the export"
        )


def load_export(path: Path | str) -> Export:
    path = Path(path)
    if not path.exists():
        raise ExportError(f"Export not found: {path}")
    data = path.read_bytes()
    tables: dict[str, pd.DataFrame] = {}
    schema: dict[str, list[str]] = platform_info()["tables"]
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise ExportError(f"{path} is not a ZIP file") from e
    with archive:
        names = set(archive.namelist())
        missing_files = [f for f in [*schema, "codebook.md"] if f not in names]
        if missing_files:
            raise ExportError(f"{path.name} is missing: {', '.join(missing_files)}")
        for file, expected in schema.items():
            with archive.open(file) as f:
                df = pd.read_csv(f, dtype=str, keep_default_na=False, encoding="utf-8")
            _check_columns(file, list(df.columns), expected)
            df = _coerce(file, df)
            _check_domains(file, df)
            tables[file] = df
        codebook = archive.read("codebook.md").decode("utf-8")
        synthetic = SYNTHETIC_MARKER in names
    _check_trials(tables["comparison_trials.csv"])
    return Export(
        participants=tables["participants.csv"],
        background=tables["questionnaire_background.csv"],
        comparison_trials=tables["comparison_trials.csv"],
        breaks=tables["breaks.csv"],
        task_trials=tables["task_trials.csv"],
        questionnaire_task=tables["questionnaire_task.csv"],
        rankings=tables["rankings.csv"],
        events=tables["events.csv"],
        codebook=codebook,
        synthetic=synthetic,
        path=path,
        sha256=hashlib.sha256(data).hexdigest(),
    )
