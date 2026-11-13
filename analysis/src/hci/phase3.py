"""Phase 3 statistics (RQ4): questionnaire scores, mixed models (with study language as a covariate), the H4b
equivalence test and rankings. There are no subgroup analyses.

Item metadata comes from the export and the platform's instrument files, never from this code, so the licensed items
can replace the placeholders without any change here.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from hci import figures
from hci.clean import clean
from hci.config import REPO_ROOT, Config
from hci.io import Export, load_export
from hci.learning import bootstrap_mean_ci
from hci.outputs import Report, new_run, write_manifest
from hci.rstats import as_arg, r_versions, run_r

CONDITIONS = ["static", "global", "cluster5", "personalFull"]


LANGUAGES = ("en", "ur")


def instrument_raw(name: str, lang: str = "en") -> bytes | None:
    """The instrument file's bytes, looked up the way the platform does: environment variable INSTRUMENT_<NAME>_<LANG>,
    then the gitignored content/questionnaires/private/ copy (licensed items), then the committed file."""
    env = os.environ.get(f"INSTRUMENT_{name.upper()}_{lang.upper()}", "")
    if env.strip():
        return env.encode("utf-8")
    for path in (
        REPO_ROOT / "content" / "questionnaires" / "private" / f"{name}.{lang}.json",
        REPO_ROOT / "content" / "questionnaires" / f"{name}.{lang}.json",
    ):
        if path.exists():
            return path.read_bytes()
    return None


def read_instrument(name: str, lang: str = "en") -> tuple[dict[str, Any], str]:
    """The instrument file and its hash, computed the way the platform does."""
    raw = instrument_raw(name, lang)
    if raw is None:
        raise FileNotFoundError(f"No instrument file for {name} ({lang})")
    return json.loads(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest()[:16]


def _instrument_versions(name: str) -> set[str]:
    """Version labels of every language file of an instrument; all share item IDs, scales and reverse coding."""
    versions = set()
    for lang in LANGUAGES:
        if instrument_raw(name, lang) is not None:
            file, file_hash = read_instrument(name, lang)
            versions.add(f"{file['version']}#{file_hash}")
    return versions


def score_questionnaires(answers: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    """Scale scores per participant and block. Reverse-coded items are flipped and N/A answers left out.

    Returns (overall scores in wide form, subscale scores in long form, notes).
    """
    notes: list[str] = []
    rows = []
    for instrument, group in answers.groupby("instrument"):
        file, file_hash = read_instrument(str(instrument))
        items = {item["id"]: item for item in file["items"]}
        unknown = sorted(set(group["item_id"].astype(str)) - set(items))
        if unknown:
            raise ValueError(f"{instrument}: the export has items that are not in the instrument file: {unknown}")
        versions = set(group["instrument_version"].dropna().astype(str))
        current = _instrument_versions(str(instrument))
        stale = [v for v in versions if not v.endswith("#SYNTHETIC") and v not in current]
        if stale:
            notes.append(
                f"{instrument}: answers were given on item file {stale}, but the current files are {sorted(current)}."
            )
        if file.get("placeholder"):
            notes.append(f"{instrument}: placeholder items, to be replaced by the licensed versions before the study.")
        for row in group.dropna(subset=["value"]).to_dict("records"):
            item = items[str(row["item_id"])]
            low, points = item["scale"]["min"], item["scale"]["points"]
            value = float(row["value"])
            if row["reverse_coded"]:
                value = 2 * low + points - 1 - value
            rows.append(
                {
                    "participant": str(row["participant_code"]),
                    "block_index": int(row["block_index"]),
                    "instrument": str(instrument),
                    "section": item.get("section") or "",
                    "value": value,
                }
            )
    long = pd.DataFrame(rows)
    overall = long.groupby(["participant", "block_index", "instrument"], as_index=False)["value"].mean()
    wide = overall.pivot(index=["participant", "block_index"], columns="instrument", values="value").reset_index()
    wide.columns.name = None
    subscales = long.groupby(["participant", "block_index", "instrument", "section"], as_index=False)["value"].mean()
    return wide, subscales, notes


def _final_target(snapshot: Any) -> str:
    steps = json.loads(snapshot) if isinstance(snapshot, str) else []
    return steps[-1]["config"] if steps else "base"


def build_blocks(
    export: Export, participants: list[str], required_items: int
) -> tuple[pd.DataFrame, pd.DataFrame, list[str]]:
    tasks = export.task_trials
    tasks = tasks[tasks["condition"].isin(CONDITIONS) & tasks["participant_code"].isin(participants)]
    tasks = tasks[tasks["finished_at"].notna()]
    scores, subscales, notes = score_questionnaires(
        export.questionnaire_task[export.questionnaire_task["participant_code"].isin(participants)]
    )
    language = export.participants.set_index("participant_code")["language"].fillna("en").astype(str)
    frame = pd.DataFrame(
        {
            "participant": tasks["participant_code"].astype(str),
            "language": tasks["participant_code"].astype(str).map(language).fillna("en"),
            "condition": tasks["condition"].astype(str),
            "position": tasks["block_index"].astype(int),
            "block_index": tasks["block_index"].astype(int),
            "task": tasks["task_id"].astype(str),
            "log_time": np.log(tasks["duration_ms"].astype(float)),
            "items_found": tasks["required_items_found"].astype(float),
            "success": (
                (tasks["required_items_found"] == required_items) & tasks["within_budget"].fillna(False).astype(bool)
            ).astype(int),
            "target": tasks["plan_snapshot"].map(_final_target),
        }
    )
    frame = frame.merge(scores, on=["participant", "block_index"], how="left").rename(columns={"ues_sf": "ues"})
    return frame.reset_index(drop=True), subscales, notes


def _identical_targets(blocks: pd.DataFrame) -> list[str]:
    wide = blocks.pivot(index="participant", columns="condition", values="target")
    return sorted(wide[wide["cluster5"] == wide["personalFull"]].index)


def _run_models(blocks: pd.DataFrame, ranks: pd.DataFrame, work: Path, margin: float) -> dict[str, pd.DataFrame]:
    work.mkdir(parents=True, exist_ok=True)
    blocks.to_csv(work / "blocks.csv", index=False, lineterminator="\n")
    ranks.to_csv(work / "ranks.csv", index=False, lineterminator="\n")
    run_r("phase3_models.R", as_arg(work / "blocks.csv"), as_arg(work / "ranks.csv"), as_arg(work), str(margin))
    names = ("contrasts", "means", "tost", "friedman", "pairwise_ranks", "plackett_luce", "status")
    return {name: pd.read_csv(work / f"{name}.csv", keep_default_na=False, na_values=["NA"]) for name in names}


def _h4b_text(tost: pd.Series, n: int, full_n: int) -> str:
    interval = f"cluster5 - personalFull = {tost['estimate']:.2f} scale points, 90% CI {tost['ci90_low']:.2f} to {tost['ci90_high']:.2f}"
    verdict = "within" if tost["equivalent"] else "not shown to be within"
    if n < full_n:
        return f"Estimation is primary, because N = {n} is below {full_n}: {interval}. Secondary TOST: {verdict} the margin of ±{tost['margin']:g}, p = {tost['p_tost']:.3f}."
    return f"TOST: {verdict} the margin of ±{tost['margin']:g} (p = {tost['p_tost']:.3f}): {interval}."


def run_phase3(export_path: Path, config: Config, *, output_root: Path | None = None) -> Path:
    export = load_export(export_path)
    finished = (
        export.participants.loc[export.participants["sessionB_status"] == "completed", "participant_code"]
        .astype(str)
        .tolist()
    )
    if not finished:
        raise ValueError("No participant has completed Session B in this export, so there is nothing to analyse yet.")
    run = new_run("phase3", export_sha=export.sha256, config=config, synthetic=export.synthetic, root=output_root)
    work = run.directory / "work"
    cleaned = clean(export, config)
    failed = next((e.ids for e in cleaned.log if "attention" in e.rule), [])
    withdrawn = next((e.ids for e in cleaned.log if "withdrawn" in e.rule), [])
    primary_people = sorted(set(finished) & set(cleaned.codes()))
    required_items = int(pd.Series([t["requiredItems"] for t in _platform_tasks()]).iloc[0])

    blocks, subscales, notes = build_blocks(export, primary_people, required_items)
    ranks = export.rankings[export.rankings["participant_code"].isin(primary_people)]
    rank_frame = pd.DataFrame(
        {
            "participant": ranks["participant_code"].astype(str),
            "condition": ranks["condition"].astype(str),
            "rank": ranks["rank"].astype(int),
        }
    )
    margin = config.phase3.equivalence_margin
    primary = _run_models(blocks, rank_frame, work / "primary", margin)

    identical = _identical_targets(blocks)
    coincidence = pd.DataFrame(
        [
            {
                "participants": len(primary_people),
                "identical_cluster5_personalFull": len(identical),
                "share": len(identical) / len(primary_people),
                "codes": ", ".join(identical),
            }
        ]
    )
    sensitivity_identical = None
    keep = [p for p in primary_people if p not in identical]
    if identical and len(keep) >= 4:
        sensitivity_identical = _run_models(
            blocks[blocks["participant"].isin(keep)],
            rank_frame[rank_frame["participant"].isin(keep)],
            work / "without_identical",
            margin,
        )
    sensitivity_attention = None
    kept_failures = [p for p in failed if p in finished]
    if kept_failures:
        all_people = sorted(set(primary_people) | set(kept_failures))
        all_blocks, _, _ = build_blocks(export, all_people, required_items)
        all_ranks = export.rankings[export.rankings["participant_code"].isin(all_people)]
        all_rank_frame = pd.DataFrame(
            {
                "participant": all_ranks["participant_code"].astype(str),
                "condition": all_ranks["condition"].astype(str),
                "rank": all_ranks["rank"].astype(int),
            }
        )
        sensitivity_attention = _run_models(all_blocks, all_rank_frame, work / "attention_kept", margin)

    mean_ranks = rank_frame.groupby("condition", as_index=False)["rank"].mean().rename(columns={"rank": "mean_rank"})
    rank_counts = rank_frame.groupby(["condition", "rank"]).size().rename("count").reset_index()

    run.write_table(
        "contrasts", primary["contrasts"], "Mixed-model contrasts (Holm across the 4 contrasts within each outcome)"
    )
    run.write_table("condition_means", primary["means"], "Estimated condition means")
    run.write_table("h4b_tost", primary["tost"], "H4b equivalence of cluster5 and personalFull on QUIS")
    run.write_table("rank_friedman", primary["friedman"], "Rankings: Friedman test")
    run.write_table("rank_pairwise", primary["pairwise_ranks"], "Rankings: pairwise Wilcoxon (Holm)")
    run.write_table("rank_mean", mean_ranks, "Mean rank per condition")
    run.write_table("rank_plackett_luce", primary["plackett_luce"], "Rankings: Plackett-Luce")
    run.write_table(
        "plan_coincidence", coincidence, "Participants whose cluster5 and personalFull targets were identical"
    )
    run.write_table(
        "subscales",
        subscales.groupby(["instrument", "section"], as_index=False)["value"].mean(),
        "Mean subscale scores",
    )

    figures.condition_means(run, primary["means"])
    figures.rank_distribution(run, rank_counts)

    n = len(primary_people)
    full_n = config.phase3.full_tost_n
    lmm_tost = primary["tost"].iloc[0]
    report = Report(run, "Phase 3 analysis report")
    report.h2("Data and exclusions")
    report.p(
        f"{n} participants completed Session B and are in the primary analysis. Left out: {len(failed)} attention-check failures, {len(withdrawn)} withdrawn."
    )
    report.table(
        pd.DataFrame([{"rule": e.rule, "action": e.action, "count": e.count, "unit": e.unit} for e in cleaned.log])
    )
    for note in notes:
        report.banner(note)
    report.h2("RQ4: adaptive interfaces vs static (H4a)")
    report.p(
        "outcome ~ condition + position + task + language + (1|participant). Study language (English or Urdu) is a covariate; it is dropped if only one language was used or if it is confounded with the design (status table, language_covariate). Linear mixed models for QUIS, UES and log task time, logistic for task success (all 6 items found and within budget). Items found is secondary. Holm across the 4 contrasts within each outcome. A secondary outcome with no variation is not fitted (see the status table)."
    )
    report.figure("condition_means", "Condition means with 95% CIs")
    report.table(primary["contrasts"])
    report.table(primary["status"])
    trouble = primary["status"][primary["status"]["warnings"].astype(str).str.strip().ne("")]
    for row in trouble.itertuples():
        report.banner(
            f"The {row.outcome} model did not fit cleanly ({row.warnings}). Do not interpret its estimates: check the raw rates below."
        )
    if len(trouble):
        report.table(
            blocks.groupby(["condition", "task"], as_index=False).agg(
                success_rate=("success", "mean"), items_found=("items_found", "mean")
            )
        )
    report.h2("RQ4: cluster5 vs personalFull (H4b)")
    report.p(_h4b_text(lmm_tost, n, full_n))
    report.p(
        f"The margin of ±{margin:g} scale points is a preregistered constant. The first row is the test on the mixed-model contrast. The second, if present, is a TOSTER cross-check on paired condition means, without position and task."
    )
    report.table(primary["tost"])
    report.h2("Rankings")
    report.figure("rank_distribution", "Rank distribution per condition")
    report.table(mean_ranks)
    report.table(primary["friedman"])
    report.table(primary["pairwise_ranks"])
    report.h3("Plackett-Luce")
    report.table(primary["plackett_luce"])
    report.h2("Plan coincidence")
    report.p(
        "Participants whose cluster5 and personalFull targets were identical saw the same interface twice, so they say nothing about H4b."
    )
    report.table(coincidence.drop(columns=["codes"]))
    if sensitivity_identical is not None:
        report.h3("Sensitivity: without those participants")
        report.p(_h4b_text(sensitivity_identical["tost"].iloc[0], len(keep), full_n))
        report.table(sensitivity_identical["contrasts"][sensitivity_identical["contrasts"]["outcome"] == "quis"])
    report.h2("Sensitivity: attention failures kept in")
    if sensitivity_attention is None:
        report.p("No attention-check failure completed Session B, so this would match the primary analysis.")
    else:
        report.p(f"Adds back: {', '.join(kept_failures)}.")
        report.table(sensitivity_attention["contrasts"][sensitivity_attention["contrasts"]["outcome"] == "quis"])
        report.table(sensitivity_attention["tost"])
    path = report.write()
    write_manifest(
        run,
        config=config,
        inputs={export_path.name: export.sha256},
        seeds_used=config.seeds.model_dump(),
        r_packages=r_versions(("lme4", "lmerTest", "emmeans", "TOSTER", "PlackettLuce")),
    )
    return path


def _platform_tasks() -> list[dict[str, Any]]:
    from hci.platform import platform_info

    return platform_info()["tasks"]
