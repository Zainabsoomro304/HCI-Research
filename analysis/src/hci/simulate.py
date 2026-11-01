"""SYNTHETIC export generator: a ZIP with the platform's exact files and columns, produced from known ground truth.

Trial schedules and Session B block orders come from the platform's own generators (scripts/analysis-schedule.ts).
Questionnaire items come from the platform's instrument files. Everything is labelled SYNTHETIC, including a marker file
inside the ZIP that the loader detects, so synthetic data cannot pass as real even if the file is renamed.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from scipy.special import expit

from hci.conditions import condition_models, condition_targets
from hci.config import REPO_ROOT, Config
from hci.encoding import BASE_CONFIG_ID, FEATURES, SETTING_KEYS, SETTINGS, encode, num_changed
from hci.io import SYNTHETIC_MARKER
from hci.model import comparisons_from_trials, use_curvature
from hci.node import run_tsx
from hci.platform import platform_info

_EPOCH = datetime(2026, 1, 1, 9, 0, tzinfo=UTC)
_QUESTIONNAIRE_LABELS = {
    "layout": ("prefLayout", {"list": "list", "grid2": "grid2", "grid3": "grid3"}),
    "fontSize": ("prefTextSize", {"default": "medium", "small": "small", "large": "large"}),
    "density": ("prefDetail", {"detailed": "lots", "partial": "some", "summary": "minimal"}),
    "theme": ("prefTheme", {"light": "light", "dark": "dark"}),
    "menu": ("prefMenu", {"sidebar": "side", "dropdown": "dropdown"}),
}


def _iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def _bit(flag: bool) -> str:
    return "1" if flag else "0"


def _json(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"))


@dataclass
class Person:
    code: str
    number: int
    seed: int
    group: str
    cluster: int
    w: np.ndarray
    lapse: float
    plan: dict[str, Any]
    rng: np.random.Generator


def _true_preference(w: np.ndarray, config_id: str) -> float:
    return float(encode(config_id) @ w)


def _p_left(person: Person, sim: Any, left: str, right: str, position: float) -> float:
    du = _true_preference(person.w, left) - _true_preference(person.w, right)
    dbusy = num_changed(left) - num_changed(right)
    dcurv = (num_changed(left) - 3) ** 2 - (num_changed(right) - 3) ** 2
    p = float(expit(du + sim.side_bias + sim.busy_gamma * dbusy + sim.busy_curvature * dcurv))
    lapse = person.lapse + sim.fatigue_lapse_slope * position
    if person.group == "nonCs":
        lapse += sim.noncs_extra_lapse
    lapse = min(lapse, 1.0)
    return (1 - lapse) * p + lapse / 2


def _expected_consistency(person: Person, sim: Any, schedule: list[dict[str, Any]]) -> float:
    """The person's true probability of choosing the same clip on an original trial and its repeat, on average."""
    n = len([t for t in schedule if not t["isPractice"]])
    by_seq = {t["seq"]: t for t in schedule}
    values = []
    for t in schedule:
        if not t["isRepeat"]:
            continue
        o = by_seq[t["repeatOfSeq"]]
        p_o = _p_left(person, sim, o["left"], o["right"], o["trialIndex"] / n)
        p_r_same = 1 - _p_left(person, sim, t["left"], t["right"], t["trialIndex"] / n)  # sides are swapped
        values.append(p_o * p_r_same + (1 - p_o) * (1 - p_r_same))
    return float(np.mean(values))


def _simulate_comparisons(
    person: Person, sim: Any, schedule: list[dict[str, Any]], incomplete: bool
) -> list[dict[str, str]]:
    rng = person.rng
    info = platform_info()
    n = info["design"]["mainTrials"] + info["design"]["repeatTrials"] + info["design"]["attentionChecks"]
    stop_at = int(rng.integers(20, n)) if incomplete else None
    rows: list[dict[str, str]] = []
    clock = _EPOCH + timedelta(days=person.number)
    for t in schedule:
        analysis = not t["isPractice"]
        position = t["trialIndex"] / n if analysis else 0.0
        answered = stop_at is None or not analysis or t["trialIndex"] <= stop_at
        if t["isAttentionCheck"]:
            choice = "left" if rng.random() < sim.attention_error_rate else "right"
        else:
            choice = "left" if rng.random() < _p_left(person, sim, t["left"], t["right"], position) else "right"
        rt = max(150, int(rng.lognormal(np.log(sim.rt_median_ms), sim.rt_log_sd)))
        trial_id = f"syn{person.number:03d}t{t['seq']:03d}"
        origin = t["repeatOfSeq"]
        origin_index = None
        if origin is not None:
            origin_index = next(o["trialIndex"] for o in schedule if o["seq"] == origin)
        shown = clock
        ended = shown + timedelta(milliseconds=8000)
        done = ended + timedelta(milliseconds=rt)
        clock = done + timedelta(milliseconds=800)
        row = {
            "participant_code": person.code,
            "study_phase": "3",
            "group": person.group,
            "session_type": "p3_sessionA",
            "trial_id": trial_id,
            "seq": str(t["seq"]),
            "trial_index": str(t["trialIndex"]),
            "is_practice": _bit(t["isPractice"]),
            "is_repeat": _bit(t["isRepeat"]),
            "repeat_of_trial_id": "" if origin is None else f"syn{person.number:03d}t{origin:03d}",
            "repeat_of_trial_index": "" if origin_index is None else str(origin_index),
            "repeat_gap": "" if origin_index is None else str(t["trialIndex"] - origin_index),
            "is_attention_check": _bit(t["isAttentionCheck"]),
            "choice": choice if answered else "",
            "chosen_clip_id": (t["left"] if choice == "left" else t["right"]) if answered else "",
            "rt_ms": str(rt) if answered else "",
            "replay_count": str(int(rng.random() < 0.05)) if answered else "",
            "client_shown_at": _iso(shown) if answered else "",
            "client_both_ended_at": _iso(ended) if answered else "",
            "client_responded_at": _iso(done) if answered else "",
            "server_responded_at": _iso(done + timedelta(milliseconds=60)) if answered else "",
            "app_version": "SYNTHETIC",
        }
        for side, clip in (("left", t["left"]), ("right", t["right"])):
            row[f"{side}_clip_id"] = clip
            row[f"{side}_numChangedSettings"] = str(num_changed(clip))
            for key, level in zip(SETTING_KEYS, clip.split("-"), strict=True):
                row[f"{side}_{key}"] = level
        rows.append(row)
    return rows


def _simulate_background(person: Person, sim: Any) -> dict[str, str]:
    """Self-rated preferences follow the true best level with probability `questionnaire_informativeness`."""
    rng = person.rng
    row = {
        "participant_code": person.code,
        "study_phase": "3",
        "session_type": "p3_sessionA",
        "submitted_at": _iso(_EPOCH + timedelta(days=person.number, minutes=-5)),
        "age": str(int(rng.integers(18, 60))),
        "gender": str(rng.choice(["woman", "man", "nonBinary", "preferNot"])),
        "genderSelfDescribe": "",
        "occupation": str(rng.choice(["student", "employed"])),
        "occupationOther": "",
        "field": "SYNTHETIC",
        "csOrIt": "yes" if person.group == "cs" else "no",
        "techConfidence": str(int(rng.integers(3, 8))),
        "shoppingFrequency": str(rng.choice(["monthly", "weekly"])),
    }
    start = 0
    for setting, levels in SETTINGS.items():
        size = len(levels) - 1
        utilities = np.concatenate([[0.0], person.w[start : start + size]])
        start += size
        column, labels = _QUESTIONNAIRE_LABELS[setting]
        draw = rng.random()
        if draw < sim.questionnaire_no_preference:
            row[column] = "noPreference"
        elif rng.random() < sim.questionnaire_informativeness:
            row[column] = labels[levels[int(np.argmax(utilities))]]
        else:
            row[column] = labels[levels[int(rng.integers(0, len(levels)))]]
    return row


def _read_instrument(name: str) -> dict[str, Any]:
    path = REPO_ROOT / "content" / "questionnaires" / f"{name}.en.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _instrument_label(file: dict[str, Any]) -> str:
    return f"{file['version']}#SYNTHETIC"


def _simulate_session_b(
    person: Person, sb: Any, blocks: list[dict[str, Any]], instruments: dict[str, dict[str, Any]], task_effects: dict[str, float],
    scenario_shift: float, participant_effect: float, condition_row: int, task_row: int,
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], list[dict[str, str]], list[dict[str, Any]]]:  # fmt: skip
    rng = person.rng
    tasks = {t["id"]: t for t in platform_info()["tasks"]}
    task_rows, question_rows, rank_rows, event_rows, latents = [], [], [], [], []
    clock = _EPOCH + timedelta(days=100 + person.number)
    for block in blocks:
        condition, task_id, index = block["condition"], block["taskId"], block["blockIndex"]
        target = person.plan["targets"][condition]
        utility = _true_preference(person.w, target)
        quis = (
            sb.quis_mean
            + sb.quis_per_utility * utility
            + (scenario_shift if condition == "cluster5" else 0.0)
            + participant_effect
            + task_effects[task_id]
            + sb.position_effect * index
            + rng.normal(0, sb.residual_sd)
        )
        latents.append({"block_index": index, "condition": condition, "task_id": task_id, "target": target,
                        "utility": utility, "quis_latent": float(quis)})  # fmt: skip
        success = rng.random() < expit(sb.success_logit + sb.success_per_quis * (quis - sb.quis_mean))
        found = 6 if success else int(rng.integers(3, 6))
        within = bool(success or rng.random() < sb.within_budget_rate)
        budget = tasks[task_id]["budget"]
        spent = int(budget * rng.uniform(0.75, 0.99)) if within else int(budget * rng.uniform(1.01, 1.2))
        duration = int(
            1000 * sb.time_median_s * np.exp(sb.time_per_quis * (quis - sb.quis_mean) + rng.normal(0, sb.time_log_sd))
        )
        steps = (
            []
            if condition == "static"
            else [{"trigger": {"type": "afterMs", "value": person.plan["trigger_ms"]}, "config": target}]
        )
        applied = (
            [{"step": 0, "configId": target, "atMs": person.plan["trigger_ms"] + int(rng.integers(0, 60))}]
            if steps
            else []
        )
        started = clock
        finished = started + timedelta(milliseconds=duration + 1000)
        clock = finished + timedelta(minutes=3)
        final = {f"final_{k}": v for k, v in zip(SETTING_KEYS, target.split("-"), strict=True)}
        task_rows.append(
            {
                "participant_code": person.code, "group": person.group, "block_index": str(index),
                "interface_number": str(index + 1), "condition": condition, "task_id": task_id, "budget": str(budget),
                "condition_row": str(condition_row), "task_row": str(task_row), "started_at": _iso(started),
                "first_interaction_at": _iso(started + timedelta(seconds=1)), "finished_at": _iso(finished),
                "duration_ms": str(duration), "required_items_found": str(found), "within_budget": _bit(within),
                "total_spent": str(spent), "extra_items": "0", "final_config_id": target, **final,
                "plan_steps": str(len(steps)), "applied_steps": str(len(applied)), "applied_configs": _json(applied),
                "cart": "[]", "plan_snapshot": _json(steps), "app_version": "SYNTHETIC",
            }
        )  # fmt: skip
        block_id = f"syn{person.number:03d}b{index}"
        for event, at in (("task_start", started), ("task_finish", finished)):
            event_rows.append(_event_row(person, block_id, target, event, at))
        for name, file in instruments.items():
            fraction = np.clip(quis / 9.0, 0, 1)  # the latent score is on the 0-9 scale; items map onto their own range
            for item in file["items"]:
                low, points = item["scale"]["min"], item["scale"]["points"]
                value = low + fraction * (points - 1) + rng.normal(0, sb.item_noise_sd)
                value = int(np.clip(np.rint(value), low, low + points - 1))
                if item.get("reverse", False):
                    value = 2 * low + points - 1 - value
                is_na = bool(item.get("allowNA", False)) and rng.random() < sb.na_rate
                question_rows.append(
                    {
                        "participant_code": person.code, "group": person.group, "block_index": str(index),
                        "interface_number": str(index + 1), "condition": condition, "task_id": task_id, "instrument": name,
                        "instrument_version": _instrument_label(file), "item_id": item["id"],
                        "value": "" if is_na else str(value), "is_na": _bit(is_na),
                        "reverse_coded": _bit(bool(item.get("reverse", False))), "submitted_at": _iso(finished),
                    }
                )  # fmt: skip
    noisy = [(row["quis_latent"] + rng.normal(0, sb.rank_noise_sd), row) for row in latents]
    for rank, (_, row) in enumerate(sorted(noisy, key=lambda pair: -pair[0]), start=1):
        rank_rows.append(
            {
                "participant_code": person.code, "group": person.group, "interface_number": str(row["block_index"] + 1),
                "block_index": str(row["block_index"]), "condition": row["condition"], "task_id": row["task_id"],
                "final_config_id": row["target"], "rank": str(rank), "reason": "", "submitted_at": _iso(clock),
            }
        )  # fmt: skip
    return task_rows, question_rows, rank_rows, event_rows, latents


def _event_row(person: Person, trial_id: str, config_id: str, event: str, at: datetime) -> dict[str, str]:
    ms = int(at.timestamp() * 1000)
    return {
        "participant_code": person.code, "session_type": "p3_sessionB", "event_id": "",
        "client_event_id": f"syn-{trial_id}-{event}", "trial_id": trial_id, "config_id": config_id, "type": event,
        "client_ts_ms": str(ms), "client_ts": _iso(at), "server_ts": _iso(at), "is_practice": "0", "payload": "{}",
    }  # fmt: skip


def _to_csv(file: str, rows: list[dict[str, str]]) -> str:
    columns = platform_info()["tables"][file]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, lineterminator="\n", restval="", extrasaction="raise")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def _codebook() -> str:
    lines = ["# Codebook - SYNTHETIC export", "", "Generated by `hci simulate`. Not real participant data.", ""]
    for file, columns in platform_info()["tables"].items():
        lines.extend([f"## {file}", "", *[f"- `{c}`" for c in columns], ""])
    return "\n".join(lines)


def simulate_export(config: Config, *, n: int, seed: int, out: Path, scenario: str | None = None) -> dict[str, Any]:
    """Writes the SYNTHETIC ZIP and its ground truth (<out stem>.truth.json). The same seed gives identical bytes."""
    if "synthetic" not in out.name.lower():
        raise ValueError(f"Synthetic exports must have SYNTHETIC in the file name, got {out.name}")
    if n < 4:
        raise ValueError("Need at least 4 participants")
    sim = config.simulate
    sb = sim.session_b
    scenario = scenario or sb.scenario
    if scenario not in sb.scenarios:
        raise ValueError(f"Unknown scenario {scenario!r}; choose from {sorted(sb.scenarios)}")
    root = np.random.SeedSequence(seed)
    streams = root.spawn(n + 1)
    shared = np.random.default_rng(streams[0])
    seeds = [int(s) for s in shared.integers(1, 2**31 - 1, size=n)]
    bridge = json.loads(
        run_tsx("analysis-schedule.ts", _json([{"number": i + 1, "seed": s} for i, s in enumerate(seeds)]))
    )

    means = np.array(sim.cluster_means)
    probabilities = np.array(sim.cluster_probs) / np.sum(sim.cluster_probs)
    people: list[Person] = []
    n_cs = int(round(n * sim.cs_share))
    groups = ["cs"] * n_cs + ["nonCs"] * (n - n_cs)
    groups = [groups[i] for i in shared.permutation(n)]
    for i in range(n):
        rng = np.random.default_rng(streams[i + 1])
        cluster = int(rng.choice(len(means), p=probabilities))
        decisiveness = float(rng.lognormal(0, sim.decisiveness_log_sd))
        people.append(
            Person(
                code=f"P3-{i + 1:03d}", number=i + 1, seed=seeds[i], group=groups[i], cluster=cluster,
                w=decisiveness * (sim.weight_scale * means[cluster] + rng.normal(0, sim.individual_sd, len(FEATURES))),
                lapse=float(rng.uniform(sim.lapse_min, sim.lapse_max)), plan={}, rng=rng,
            )
        )  # fmt: skip

    incomplete = set(range(n - sim.incomplete_participants, n))
    trial_rows, background_rows, break_rows = [], [], []
    consistency_expected: dict[str, float] = {}
    per_person_rows: dict[str, list[dict[str, str]]] = {}
    for i, (person, item) in enumerate(zip(people, bridge, strict=True)):
        rows = _simulate_comparisons(person, sim, item["schedule"], i in incomplete)
        per_person_rows[person.code] = rows
        trial_rows.extend(rows)
        background_rows.append(_simulate_background(person, sim))
        consistency_expected[person.code] = _expected_consistency(person, sim, item["schedule"])
        for after in platform_info()["design"]["breakAfter"]:
            start = _EPOCH + timedelta(days=person.number, minutes=after)
            duration = int(person.rng.integers(10_000, 90_000))
            break_rows.append({
                "participant_code": person.code, "session_type": "p3_sessionA", "after_trial_index": str(after),
                "started_at": _iso(start), "ended_at": _iso(start + timedelta(milliseconds=duration)),
                "duration_ms": str(duration),
            })  # fmt: skip

    main_by_person = {}
    for person in people:
        rows = [
            r
            for r in per_person_rows[person.code]
            if r["choice"] and r["is_practice"] == "0" and r["is_repeat"] == "0" and r["is_attention_check"] == "0"
        ]
        main_by_person[person.code] = comparisons_from_trials(_rows_frame(rows))

    curvature = use_curvature(config.model.curvature, config.model.curvature_max_vif)
    for i, person in enumerate(people):
        if i in incomplete:
            person.plan = {
                "targets": {c: BASE_CONFIG_ID for c in platform_info()["conditions"]},
                "trigger_ms": config.plans.trigger_after_ms,
            }
            continue
        complete = {p.code: main_by_person[p.code] for j, p in enumerate(people) if j not in incomplete}
        models = condition_models(person.code, complete, sigma=sb.plan_sigma, use_curvature=curvature, config=config)
        person.plan = {
            "targets": condition_targets(models, config.targets.min_changed, config.targets.max_changed),
            "trigger_ms": config.plans.trigger_after_ms,
            "cluster5_assigned": models.cluster5_assigned,
            "cluster_k": models.cluster_k,
        }

    instruments = {name: _read_instrument(name) for name in ("quis", "ues_sf")}
    task_effects = {t["id"]: float(shared.normal(0, sb.task_sd)) for t in platform_info()["tasks"]}
    shift = sb.scenarios[scenario]["cluster5_shift"]
    task_rows, question_rows, rank_rows, event_rows, participant_rows = [], [], [], [], []
    truth_people = []
    for i, (person, item) in enumerate(zip(people, bridge, strict=True)):
        rows = per_person_rows[person.code]
        done = i not in incomplete
        participant_rows.append(_participant_row(person, rows, item, done))
        latents: list[dict[str, Any]] = []
        if done:
            effect = float(person.rng.normal(0, sb.participant_sd))
            t, q, r, e, latents = _simulate_session_b(
                person,
                sb,
                item["blocks"],
                instruments,
                task_effects,
                shift,
                effect,
                item["conditionRow"],
                item["taskRow"],
            )
            task_rows.extend(t)
            question_rows.extend(q)
            rank_rows.extend(r)
            event_rows.extend(e)
        truth_people.append({
            "participant_code": person.code, "group": person.group, "cluster": person.cluster,
            "w": person.w.tolist(), "lapse": person.lapse, "expected_consistency": consistency_expected[person.code],
            "plan_targets": person.plan["targets"], "session_b": latents,
        })  # fmt: skip
    for index, row in enumerate(event_rows, start=1):
        row["event_id"] = str(index)

    files = {
        "participants.csv": _to_csv("participants.csv", participant_rows),
        "questionnaire_background.csv": _to_csv("questionnaire_background.csv", background_rows),
        "comparison_trials.csv": _to_csv("comparison_trials.csv", trial_rows),
        "breaks.csv": _to_csv("breaks.csv", break_rows),
        "task_trials.csv": _to_csv("task_trials.csv", task_rows),
        "questionnaire_task.csv": _to_csv("questionnaire_task.csv", question_rows),
        "rankings.csv": _to_csv("rankings.csv", rank_rows),
        "events.csv": _to_csv("events.csv", event_rows),
        "codebook.md": _codebook(),
        SYNTHETIC_MARKER: f"SYNTHETIC DATA. Generated by hci simulate, seed {seed}, scenario {scenario}. Not real participants.\n",
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    truth = {
        "SYNTHETIC": True,
        "seed": seed,
        "n": n,
        "scenario": scenario,
        "features": list(FEATURES),
        "cluster_means": sim.cluster_means,
        "side_bias": sim.side_bias,
        "busy_gamma": sim.busy_gamma,
        "busy_curvature": sim.busy_curvature,
        "cluster5_shift": shift,
        "task_effects": task_effects,
        "participants": truth_people,
    }
    truth_path = out.with_suffix(".truth.json")
    truth_path.write_text(json.dumps(truth, indent=1), encoding="utf-8")
    return truth


def _rows_frame(rows: list[dict[str, str]]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["left_clip_id", "right_clip_id", "choice"])


def _participant_row(person: Person, rows: list[dict[str, str]], item: dict[str, Any], done: bool) -> dict[str, str]:
    """Mirrors the platform's computeQuality (src/lib/admin/quality.ts)."""
    chosen = {r["trial_id"]: r["chosen_clip_id"] for r in rows if r["chosen_clip_id"]}
    checks = [r for r in rows if r["is_attention_check"] == "1"]
    answered = [r for r in checks if r["choice"]]
    correct = sum(r["choice"] == "right" for r in answered)
    repeats = [r for r in rows if r["is_repeat"] == "1" and r["chosen_clip_id"] and r["repeat_of_trial_id"] in chosen]
    same = sum(r["chosen_clip_id"] == chosen[r["repeat_of_trial_id"]] for r in repeats)
    start = _EPOCH + timedelta(days=person.number)
    pct = "" if not repeats else f"{round(100 * same / len(repeats), 1):g}"
    return {
        "participant_code": person.code, "study_phase": "3", "number": str(person.number), "group": person.group,
        "group_source": "self", "language": "en", "seed": str(person.seed), "condition_row": str(item["conditionRow"]),
        "task_row": str(item["taskRow"]), "completion_code": "", "notes": "SYNTHETIC participant",
        "created_at": _iso(_EPOCH), "phase1_status": "", "phase1_started_at": "", "phase1_completed_at": "",
        "phase1_app_version": "", "sessionA_status": "completed" if done else "in_progress",
        "sessionA_started_at": _iso(start), "sessionA_completed_at": _iso(start + timedelta(hours=1)) if done else "",
        "sessionA_app_version": "SYNTHETIC", "sessionB_status": "completed" if done else "not_started",
        "sessionB_started_at": _iso(start + timedelta(days=100)) if done else "",
        "sessionB_completed_at": _iso(start + timedelta(days=100, hours=1)) if done else "",
        "sessionB_app_version": "SYNTHETIC" if done else "", "attention_total": str(len(checks)),
        "attention_correct": str(correct), "attention_failed": _bit(len(answered) - correct > platform_info()["maxFailedAttentionChecks"]),
        "repeats_answered": str(len(repeats)), "repeats_consistent": str(same), "consistency_pct": pct,
    }  # fmt: skip
