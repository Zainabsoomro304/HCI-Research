"""Evaluation statistics (RQ4) from Session 2 (shopping): SUS and SEQ scores, mixed models (with study language as a
covariate), the H4a contrasts, the H4b equivalence of cluster5 and personalFull on SUS, and rankings.

Reporting depends on the number of participants (config: study.small_n_threshold, 32):
  N >= 32: H4b is a TOST at the preregistered margin (primary), with the estimation figure alongside.
  N <  32: H4b is primarily estimation (difference and 95% CI drawn against the equivalence bounds); the TOST is
           secondary, and the report says plainly that the study is underpowered for formal equivalence.

Item metadata come from the platform's instrument files (content/questionnaires/<name>.<lang>.json).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from hci import figures
from hci.clean import clean
from hci.config import REPO_ROOT, Config
from hci.io import Export, load_export
from hci.outputs import Report, new_run, write_manifest
from hci.rstats import as_arg, r_versions, run_r

CONDITIONS = ["static", "global", "cluster5", "personalFull"]
LANGUAGES = ("en", "ur")
INSTRUMENTS = ("seq", "sus")


def instrument_path(name: str, lang: str = "en") -> Path:
    return REPO_ROOT / "content" / "questionnaires" / f"{name}.{lang}.json"


def read_instrument(name: str, lang: str = "en") -> tuple[dict[str, Any], str]:
    """The instrument file and its hash, computed the way the platform does."""
    path = instrument_path(name, lang)
    if not path.exists():
        raise FileNotFoundError(f"No instrument file for {name} ({lang}): {path}")
    raw = path.read_bytes()
    return json.loads(raw.decode("utf-8")), hashlib.sha256(raw).hexdigest()[:16]


def _instrument_versions(name: str) -> set[str]:
    versions = set()
    for lang in LANGUAGES:
        if instrument_path(name, lang).exists():
            file, file_hash = read_instrument(name, lang)
            versions.add(f"{file['version']}#{file_hash}")
    return versions


def sus_score(values: list[float]) -> float:
    """Brooke (1996): items 1, 3, 5, 7, 9 contribute (score - 1); items 2, 4, 6, 8, 10 contribute (5 - score); x 2.5."""
    if len(values) != 10:
        raise ValueError(f"SUS needs 10 answers, got {len(values)}")
    return 2.5 * sum((v - 1) if i % 2 == 0 else (5 - v) for i, v in enumerate(values))


def score_questionnaires(answers: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """One row per participant and block with the SUS (0-100) and SEQ (1-7) scores, computed from the item answers
    and checked against the score the platform stored. Returns (scores in wide form, notes)."""
    notes: list[str] = []
    rows = []
    for instrument, group in answers.groupby("instrument"):
        name = str(instrument)
        if name not in INSTRUMENTS:
            raise ValueError(f"Unknown instrument in the export: {name}")
        file, _ = read_instrument(name)
        order = [item["id"] for item in file["items"]]
        unknown = sorted(set(group["item_id"].astype(str)) - set(order))
        if unknown:
            raise ValueError(f"{name}: the export has items that are not in the instrument file: {unknown}")
        versions = set(group["instrument_version"].dropna().astype(str))
        current = _instrument_versions(name)
        stale = [v for v in versions if not v.endswith("#SYNTHETIC") and v not in current]
        if stale:
            notes.append(f"{name}: some answers were given on item file {stale}; the current files are {sorted(current)}.")
        for (participant, block), response in group.groupby(["participant_code", "block_index"]):
            by_item = response.set_index(response["item_id"].astype(str))
            if set(by_item.index) != set(order):
                notes.append(f"{name}: {participant} block {block} is incomplete and is not scored.")
                continue
            values = [float(by_item.loc[i, "value"]) for i in order]
            score = sus_score(values) if name == "sus" else values[0]
            stored = by_item["instrument_score"].dropna()
            if len(stored) and abs(float(stored.iloc[0]) - score) > 1e-9:
                raise ValueError(f"{name}: {participant} block {block}: computed score {score} but the export says {stored.iloc[0]}")
            rows.append({"participant": str(participant), "block_index": int(block), "instrument": name, "score": score})
    long = pd.DataFrame(rows, columns=["participant", "block_index", "instrument", "score"])
    wide = long.pivot(index=["participant", "block_index"], columns="instrument", values="score").reset_index()
    wide.columns.name = None
    for name in INSTRUMENTS:
        if name not in wide:
            wide[name] = np.nan
    return wide, notes


def _final_target(snapshot: Any) -> str:
    steps = json.loads(snapshot) if isinstance(snapshot, str) else []
    return steps[-1]["config"] if steps else "base"


def build_blocks(export: Export, participants: list[str], required_items: int) -> tuple[pd.DataFrame, list[str]]:
    tasks = export.task_trials
    tasks = tasks[tasks["condition"].isin(CONDITIONS) & tasks["participant_code"].isin(participants)]
    tasks = tasks[tasks["finished_at"].notna()]
    scores, notes = score_questionnaires(
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
    frame = frame.merge(scores, on=["participant", "block_index"], how="left")
    return frame.reset_index(drop=True), notes


def _identical_targets(blocks: pd.DataFrame) -> list[str]:
    wide = blocks.pivot(index="participant", columns="condition", values="target")
    return sorted(wide[wide["cluster5"] == wide["personalFull"]].index)


def _rank_frame(export: Export, people: list[str]) -> pd.DataFrame:
    ranks = export.rankings[export.rankings["participant_code"].isin(people)]
    return pd.DataFrame(
        {
            "participant": ranks["participant_code"].astype(str),
            "condition": ranks["condition"].astype(str),
            "rank": ranks["rank"].astype(int),
        }
    )


def _run_models(blocks: pd.DataFrame, ranks: pd.DataFrame, work: Path, margin: float) -> dict[str, pd.DataFrame]:
    work.mkdir(parents=True, exist_ok=True)
    blocks.to_csv(work / "blocks.csv", index=False, lineterminator="\n")
    ranks.to_csv(work / "ranks.csv", index=False, lineterminator="\n")
    run_r("evaluation_models.R", as_arg(work / "blocks.csv"), as_arg(work / "ranks.csv"), as_arg(work), str(margin))
    names = ("contrasts", "means", "tost", "friedman", "pairwise_ranks", "plackett_luce", "status")
    return {name: pd.read_csv(work / f"{name}.csv", keep_default_na=False, na_values=["NA"]) for name in names}


def h4b_text(tost: pd.Series, n: int, threshold: int) -> str:
    """The H4b sentence. Below the threshold, estimation leads and the underpowering is stated plainly."""
    estimate = (
        f"cluster5 - personalFull = {tost['estimate']:.1f} SUS points "
        f"(95% CI {tost['ci95_low']:.1f} to {tost['ci95_high']:.1f}; 90% CI {tost['ci90_low']:.1f} to {tost['ci90_high']:.1f})"
    )
    verdict = "within" if bool(tost["equivalent"]) else "not shown to be within"
    test = f"TOST: {verdict} the equivalence margin of ±{tost['margin']:g} SUS points, p = {tost['p_tost']:.3f}"
    if n < threshold:
        return (
            f"With N = {n} (fewer than {threshold}), H4b is reported primarily as estimation: {estimate}. "
            f"The study is underpowered for a formal equivalence test at this size, so the TOST is secondary and a "
            f"non-significant TOST is not evidence of a difference. Secondary {test}."
        )
    return f"Primary {test}. Estimate: {estimate}."


def run_evaluation(export_path: Path, config: Config, *, output_root: Path | None = None) -> Path:
    export = load_export(export_path)
    finished = (
        export.participants.loc[export.participants["shopping_status"] == "completed", "participant_code"]
        .astype(str)
        .tolist()
    )
    if not finished:
        raise ValueError("No participant has completed the shopping session (Session 2) in this export, so there is nothing to analyse yet.")
    run = new_run("evaluation", export_sha=export.sha256, config=config, synthetic=export.synthetic, root=output_root)
    work = run.directory / "work"
    cleaned = clean(export, config)
    withdrawn = next((e.ids for e in cleaned.log if "withdrawn" in e.rule), [])
    primary_people = sorted(set(finished) & set(cleaned.codes()))
    if not primary_people:
        raise ValueError("No participant who completed the shopping session passed the cleaning rules.")
    required_items = int(pd.Series([t["requiredItems"] for t in _platform_tasks()]).iloc[0])
    margin = config.evaluation.equivalence_margin
    threshold = config.study.small_n_threshold

    blocks, notes = build_blocks(export, primary_people, required_items)
    rank_frame = _rank_frame(export, primary_people)
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

    def subset(people: list[str], name: str) -> dict[str, pd.DataFrame]:
        return _run_models(blocks[blocks["participant"].isin(people)], rank_frame[rank_frame["participant"].isin(people)], work / name, margin)

    sensitivity_identical = None
    keep = [p for p in primary_people if p not in identical]
    if identical and len(keep) >= 4:
        sensitivity_identical = subset(keep, "without_identical")

    protocol = export.participants.set_index("participant_code")["protocol"].fillna("current").astype(str)
    earlier_in = [p for p in primary_people if protocol.get(p, "current") != "current"]
    current_only = [p for p in primary_people if p not in earlier_in]
    sensitivity_protocol = subset(current_only, "current_protocol_only") if earlier_in and len(current_only) >= 4 else None

    mean_ranks = rank_frame.groupby("condition", as_index=False)["rank"].mean().rename(columns={"rank": "mean_rank"})
    rank_counts = rank_frame.groupby(["condition", "rank"]).size().rename("count").reset_index()
    descriptives = blocks.groupby("condition", as_index=False).agg(
        sus_mean=("sus", "mean"), sus_sd=("sus", "std"), seq_mean=("seq", "mean"), seq_sd=("seq", "std"),
        median_time_s=("log_time", lambda v: float(np.exp(np.median(v)) / 1000)), success_rate=("success", "mean"),
    )  # fmt: skip

    h4a = primary["contrasts"][primary["contrasts"]["contrast"] != "cluster5 - personalFull"]
    run.write_table("h4a_contrasts", h4a, "H4a: each adaptive condition vs static (Holm across the 4 contrasts within each outcome)")
    run.write_table("contrasts", primary["contrasts"], "All mixed-model contrasts")
    run.write_table("condition_means", primary["means"], "Estimated condition means")
    run.write_table("descriptives", descriptives, "Raw means per condition")
    run.write_table("h4b_tost", primary["tost"], "H4b: cluster5 vs personalFull on SUS, estimate, CIs and TOST")
    run.write_table("rank_friedman", primary["friedman"], "Rankings: Friedman test")
    run.write_table("rank_pairwise", primary["pairwise_ranks"], "Rankings: pairwise Wilcoxon (Holm)")
    run.write_table("rank_mean", mean_ranks, "Mean rank per condition")
    run.write_table("rank_plackett_luce", primary["plackett_luce"], "Rankings: Plackett-Luce")
    run.write_table("plan_coincidence", coincidence, "Participants whose cluster5 and personalFull targets were identical")

    figures.condition_means(run, primary["means"])
    figures.equivalence_estimate(run, primary["tost"], margin)
    figures.rank_distribution(run, rank_counts)

    n = len(primary_people)
    lmm_tost = primary["tost"].iloc[0]
    report = Report(run, "Evaluation report (RQ4)")
    report.h2("Data and exclusions")
    report.p(
        f"{n} participants completed the shopping session (Session 2) and are in the primary analysis. Left out: {len(withdrawn)} withdrawn."
    )
    if n < threshold:
        report.banner(
            f"N = {n} is below {threshold}: H4b is reported as estimation first (difference with 95% CI against the ±{margin:g} bounds), with the TOST secondary. The study is underpowered for formal equivalence at this size."
        )
    report.table(pd.DataFrame([{"rule": e.rule, "action": e.action, "count": e.count, "unit": e.unit} for e in cleaned.log]))
    for note in notes:
        report.banner(note)
    report.h2("Questionnaires")
    report.p(
        "SUS (Brooke 1996): 10 items, 1-5; odd items contribute (answer - 1), even items (5 - answer); the sum x 2.5 gives 0-100. "
        "The English items say 'website' for 'system'. The Urdu items are the researchers' translation until the published Urdu SUS "
        "(Anam, Sadiq & Jamil 2020) replaces them. SEQ (Sauro & Dumas 2009): one item, 1 (very difficult) to 7 (very easy)."
    )
    report.table(descriptives)
    report.h2("H4a: each adaptive interface vs static")
    report.p(
        "outcome ~ condition + position + task + language + (1|participant). SUS is primary; SEQ, log task time and task success "
        "(all items found and within budget, mixed-effects logistic) are secondary; items found is descriptive. Study language is a "
        "covariate, dropped if only one language was used or if it is confounded with the design (status table). Holm across the 4 "
        "contrasts within each outcome. A secondary outcome with no variation is not fitted (status table)."
    )
    report.figure("condition_means", "Condition means with 95% CIs")
    report.table(h4a)
    report.table(primary["status"])
    trouble = primary["status"][primary["status"]["warnings"].astype(str).str.strip().ne("")]
    for row in trouble.itertuples():
        report.banner(f"The {row.outcome} model did not fit cleanly ({row.warnings}). Do not interpret its estimates: check the raw rates above.")
    report.h2("H4b: cluster5 vs personalFull on SUS")
    report.p(h4b_text(lmm_tost, n, threshold))
    report.figure("h4b_estimate", "cluster5 - personalFull on SUS, with the equivalence bounds")
    report.p(
        f"The margin of ±{margin:g} SUS points (about 0.4 SD, with SD about {config.evaluation.sus_sd:g} from Anam et al. 2020) is a preregistered constant. "
        "The first row is the mixed-model contrast; the second, if present, is a TOSTER cross-check on paired condition means, without position and task."
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
    report.p("Participants whose cluster5 and personalFull targets were identical saw the same interface twice, so they say nothing about H4b.")
    report.table(coincidence.drop(columns=["codes"]))
    if sensitivity_identical is not None:
        report.h3("Sensitivity: without those participants")
        report.p(h4b_text(sensitivity_identical["tost"].iloc[0], len(keep), threshold))
        report.table(sensitivity_identical["contrasts"][sensitivity_identical["contrasts"]["outcome"] == "sus"])
    report.h2("Sensitivity: earlier protocol version")
    if sensitivity_protocol is None:
        report.p(
            "No participant in this analysis is flagged protocol = earlier-version, so the analysis with and without them is the same."
            if not earlier_in
            else f"Flagged: {', '.join(earlier_in)}; too few others to refit without them."
        )
    else:
        report.p(f"Without {', '.join(earlier_in)} (flagged protocol = earlier-version):")
        report.p(h4b_text(sensitivity_protocol["tost"].iloc[0], len(current_only), threshold))
        report.table(sensitivity_protocol["contrasts"][sensitivity_protocol["contrasts"]["outcome"] == "sus"])
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
