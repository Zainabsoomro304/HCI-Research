"""Applies the cleaning rules from config. Nothing is dropped silently: every rule adds a line to the exclusion log."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from hci.config import Config
from hci.io import Export

_STATUS_COLUMN = {"phase1": "phase1_status", "p3_sessionA": "sessionA_status"}


@dataclass
class LogEntry:
    rule: str
    unit: str  # "participants" or "trials"
    count: int
    action: str  # "excluded" or "flagged"
    ids: list[str] = field(default_factory=list)


@dataclass
class CleanData:
    """`main` holds the answered main trials of eligible participants in chronological order."""

    participants: pd.DataFrame
    main: pd.DataFrame
    repeats: pd.DataFrame
    attention: pd.DataFrame
    log: list[LogEntry]
    warnings: list[str]

    def codes(self) -> list[str]:
        return list(self.participants["participant_code"])


def _flag(df: pd.DataFrame, column: str) -> pd.Series:
    return df[column].fillna(False).astype(bool)


def _repeat_pairs(trials: pd.DataFrame, half_boundary: int) -> pd.DataFrame:
    answered = trials[trials["choice"].notna()]
    originals = answered.set_index("trial_id")["chosen_clip_id"]
    repeats = answered[_flag(answered, "is_repeat")].copy()
    repeats["original_choice_clip"] = repeats["repeat_of_trial_id"].map(originals)
    repeats = repeats[repeats["original_choice_clip"].notna()]
    repeats["consistent"] = (repeats["chosen_clip_id"] == repeats["original_choice_clip"]).astype(int)
    repeats["half"] = (repeats["trial_index"] > half_boundary).map({False: "first", True: "second"})
    columns = ["participant_code", "group", "trial_id", "repeat_of_trial_id", "trial_index", "repeat_gap", "half",
               "consistent", "rt_ms"]  # fmt: skip
    return repeats[columns].reset_index(drop=True)


def clean(export: Export, config: Config, *, exclude_attention: bool | None = None) -> CleanData:
    """`exclude_attention` overrides the config for the sensitivity analysis (attention failures kept in)."""
    rules = config.cleaning
    exclude_attention = rules.exclude_attention_failures if exclude_attention is None else exclude_attention
    log: list[LogEntry] = []
    warnings: list[str] = []

    types = config.study.comparison_session_types
    all_trials = export.comparison_trials
    other = all_trials[~all_trials["session_type"].isin(types)]
    if len(other):
        log.append(LogEntry(f"session type not in {types}", "trials", len(other), "excluded"))
    trials = all_trials[all_trials["session_type"].isin(types)].copy()

    has_trials = export.participants["participant_code"].isin(trials["participant_code"])
    participants = export.participants[has_trials].copy()
    if (~has_trials).any():
        ids = list(export.participants.loc[~has_trials, "participant_code"])
        log.append(
            LogEntry("no comparison trials in the analysed session type", "participants", len(ids), "excluded", ids)
        )

    if rules.require_completed_session:
        done = pd.Series(False, index=participants.index)
        for t in types:
            done |= (participants[_STATUS_COLUMN[t]] == "completed").fillna(False).astype(bool)
        ids = list(participants.loc[~done, "participant_code"])
        if ids:
            log.append(LogEntry("comparison session not completed", "participants", len(ids), "excluded", ids))
        participants = participants[done]
        trials = trials[trials["participant_code"].isin(participants["participant_code"])]

    if rules.drop_practice:
        practice = _flag(trials, "is_practice")
        log.append(LogEntry("practice trials", "trials", int(practice.sum()), "excluded"))
        trials = trials[~practice]

    unanswered = trials["choice"].isna()
    if unanswered.any():
        log.append(LogEntry("unanswered trials", "trials", int(unanswered.sum()), "excluded"))

    attention = trials[_flag(trials, "is_attention_check") & trials["choice"].notna()].copy()
    attention["correct"] = attention["choice"] == "right"
    wrong = attention.assign(wrong=~attention["correct"]).groupby("participant_code")["wrong"].sum()
    failed = sorted(wrong[wrong > rules.max_failed_attention_checks].index)
    exported_failed = set(participants.loc[_flag(participants, "attention_failed"), "participant_code"])
    if set(failed) != exported_failed:
        warnings.append(
            f"Attention failures differ from participants.csv: computed {failed}, exported {sorted(exported_failed)}"
        )
    action = "excluded" if exclude_attention else "flagged"
    log.append(LogEntry("failed an attention check", "participants", len(failed), action, failed))
    participants = participants.assign(attention_flag=participants["participant_code"].isin(failed))
    if exclude_attention:
        participants = participants[~participants["attention_flag"]]
        trials = trials[trials["participant_code"].isin(participants["participant_code"])]

    is_fast = (trials["rt_ms"] < rules.fast_rt_ms).fillna(False).astype(bool)
    trials = trials.assign(fast_rt=is_fast)
    action = "excluded" if rules.exclude_fast_rt else "flagged"
    log.append(LogEntry(f"RT < {rules.fast_rt_ms} ms", "trials", int(is_fast.sum()), action))
    answered = trials[trials["choice"].notna()]
    if rules.exclude_fast_rt:
        answered = answered[~answered["fast_rt"]]

    not_main = _flag(answered, "is_practice") | _flag(answered, "is_repeat") | _flag(answered, "is_attention_check")
    main = answered[~not_main].sort_values(["participant_code", "seq"]).reset_index(drop=True)

    repeats = _repeat_pairs(trials, rules.fatigue_half_boundary)
    tally = repeats.groupby("participant_code")["consistent"].agg(n_consistent="sum", n_repeats="count")
    participants = participants.merge(tally, left_on="participant_code", right_index=True, how="left")
    participants["self_consistency"] = participants["n_consistent"] / participants["n_repeats"]
    exported = participants["repeats_consistent"].astype("Float64").fillna(-1).to_numpy(float)
    if rules.require_completed_session and (exported != participants["n_consistent"].fillna(-1).to_numpy(float)).any():
        warnings.append("Self-consistency differs from participants.csv for some participants.")

    unknown = list(participants.loc[participants["group"] == "unknown", "participant_code"])
    if unknown:
        log.append(
            LogEntry(
                "group unknown (left out of CS / non-CS descriptives)", "participants", len(unknown), "flagged", unknown
            )
        )
    return CleanData(
        participants=participants.reset_index(drop=True),
        main=main,
        repeats=repeats,
        attention=attention.reset_index(drop=True),
        log=log,
        warnings=warnings,
    )
