import JSZip from "jszip";
import type { Participant, Session } from "@prisma/client";
import { MAX_FAILED_ATTENTION_CHECKS } from "@/config/study";
import { DEFAULT_CONFIG_ID, SETTING_KEYS } from "@/config/uiSpace";
import { prisma } from "../db";
import { computeQuality } from "../admin/quality";
import { latinRows } from "../latinSquare";
import { INSTRUMENTS, loadInstrument, scoreResponses, type Instrument } from "../questionnaire/instruments";
import type { FrozenResult } from "../prepare/freeze";
import { getTask } from "../tasks";
import { TABLES, configSettings, tableDef } from "./tables";

export interface ExportFilters {
  /** Only rows from completed sessions (and participants with at least one completed session). */
  completedOnly?: boolean;
  /** Drop participants who failed the attention criterion. */
  excludeFailedAttention?: boolean;
  /** Include the shopping-session practice task and its events. */
  includePractice?: boolean;
  /** Include simulated participants from the test tools. They are left out by default. */
  includeSimulated?: boolean;
}

type Row = Record<string, unknown>;

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function escape(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(file: string, rows: Row[]): string {
  const cols = tableDef(file).columns.map((c) => c.name);
  const lines = [cols.join(","), ...rows.map((r) => cols.map((c) => escape(cell(r[c]))).join(","))];
  return lines.join("\n") + "\n";
}


export async function buildTables(filters: ExportFilters = {}): Promise<Record<string, Row[]>> {
  const participants = await prisma.participant.findMany({
    where: filters.includeSimulated ? {} : { isSimulated: false },
    orderBy: [{ isSimulated: "asc" }, { number: "asc" }],
    include: { sessions: true },
  });
  const allTrials = await prisma.comparisonTrial.findMany({
    where: { participantId: { in: participants.map((p) => p.id) } },
    orderBy: [{ sessionId: "asc" }, { seq: "asc" }],
  });
  const trialsBy = new Map<string, typeof allTrials>();
  for (const t of allTrials) trialsBy.set(t.participantId, [...(trialsBy.get(t.participantId) ?? []), t]);

  const keep = participants.filter((p) => {
    if (filters.completedOnly && !p.sessions.some((s) => s.status === "completed")) return false;
    if (filters.excludeFailedAttention && computeQuality(trialsBy.get(p.id) ?? []).attentionFailed) return false;
    return true;
  });
  const pById = new Map(keep.map((p) => [p.id, p]));
  const sessions = keep.flatMap((p) => p.sessions).filter((s) => !filters.completedOnly || s.status === "completed");
  const sById = new Map<string, Session>(sessions.map((s) => [s.id, s]));
  const sessionIds = [...sById.keys()];
  const code = (id: string) => pById.get(id)!.code;
  const rowsFor = (p: Participant) => {
    const rows = latinRows(p.number, { conditionRow: p.conditionRowOverride, taskRow: p.taskRowOverride });
    const shopping = (pById.get(p.id) as Participant & { sessions: Session[] }).sessions.find((s) => s.type === "shopping");
    return { condition_row: shopping?.conditionRow ?? rows.conditionRow, task_row: shopping?.taskRow ?? rows.taskRow };
  };

  // participants.csv
  const participantsRows = keep.map((p) => {
    const q = computeQuality(trialsBy.get(p.id) ?? []);
    const row: Row = {
      participant_code: p.code,
      legacy_code: p.legacyCode ?? p.code,
      protocol: p.protocol,
      number: p.number,
      group: p.group,
      group_source: p.groupSource,
      language: p.language,
      seed: p.seed,
      ...rowsFor(p),
      completion_code: p.completionCode,
      is_simulated: p.isSimulated,
      withdrawn_at: p.withdrawnAt,
      withdrawn_reason: p.withdrawnReason,
      notes: p.notes,
      created_at: p.createdAt,
      attention_total: q.attentionTotal,
      attention_correct: q.attentionCorrect,
      attention_failed: q.attentionFailed,
      repeats_answered: q.repeatsAnswered,
      repeats_consistent: q.repeatsConsistent,
      consistency_pct: q.consistencyPct,
    };
    for (const s of p.sessions) {
      const pre = s.type;
      Object.assign(row, { [`${pre}_status`]: s.status, [`${pre}_started_at`]: s.startedAt, [`${pre}_completed_at`]: s.completedAt, [`${pre}_app_version`]: s.appVersion });
    }
    return row;
  });

  // questionnaire_background.csv
  const bg = await prisma.questionnaireResponse.findMany({ where: { sessionId: { in: sessionIds }, instrument: "background" }, orderBy: { submittedAt: "asc" } });
  const backgroundRows = bg.map((r) => ({
    participant_code: code(r.participantId),
    session_type: sById.get(r.sessionId)!.type,
    submitted_at: r.submittedAt,
    ...(r.responses as Row),
  }));

  // comparison_trials.csv
  const trialIndexById = new Map(allTrials.map((t) => [t.id, t.trialIndex]));
  const trialRows = allTrials
    .filter((t) => sById.has(t.sessionId))
    .map((t) => {
      const s = sById.get(t.sessionId)!;
      const p = pById.get(t.participantId)!;
      return {
        participant_code: p.code,
        group: p.group,
        session_type: s.type,
        trial_id: t.id,
        seq: t.seq,
        trial_index: t.trialIndex,
        is_practice: t.isPractice,
        is_repeat: t.isRepeat,
        repeat_of_trial_id: t.repeatOfTrialId,
        repeat_of_trial_index: t.repeatOfTrialId ? trialIndexById.get(t.repeatOfTrialId) : null,
        repeat_gap: t.repeatOfTrialId ? t.trialIndex - trialIndexById.get(t.repeatOfTrialId)! : null,
        is_attention_check: t.isAttentionCheck,
        scene: t.scene,
        language: t.language,
        left_clip_id: t.leftClipId,
        ...configSettings("left", t.leftClipId),
        left_numChangedSettings: t.leftNumChangedSettings,
        right_clip_id: t.rightClipId,
        ...configSettings("right", t.rightClipId),
        right_numChangedSettings: t.rightNumChangedSettings,
        choice: t.choice,
        chosen_clip_id: t.chosenClipId,
        rt_ms: t.rtMs,
        replay_count: t.replayCount,
        client_shown_at: t.clientShownAt,
        client_both_ended_at: t.clientBothEndedAt,
        client_responded_at: t.clientRespondedAt,
        server_responded_at: t.serverRespondedAt,
        app_version: s.appVersion,
      };
    });

  // breaks.csv
  const breaks = await prisma.breakRecord.findMany({ where: { sessionId: { in: sessionIds } }, orderBy: [{ sessionId: "asc" }, { afterTrialIndex: "asc" }] });
  const breakRows = breaks.map((b) => ({
    participant_code: code(b.participantId),
    session_type: sById.get(b.sessionId)!.type,
    after_trial_index: b.afterTrialIndex,
    started_at: b.startedAt,
    ended_at: b.endedAt,
    duration_ms: b.durationMs,
  }));

  // task_trials.csv
  const blocks = await prisma.taskBlock.findMany({
    where: { sessionId: { in: sessionIds }, ...(filters.includePractice ? {} : { isPractice: false }) },
    orderBy: [{ participantId: "asc" }, { blockIndex: "asc" }],
  });
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  const taskRows = blocks.map((b) => {
    const p = pById.get(b.participantId)!;
    const applied = (b.appliedConfigs as unknown[] | null) ?? [];
    return {
      participant_code: p.code,
      group: p.group,
      block_index: b.blockIndex,
      interface_number: b.isPractice ? null : b.blockIndex + 1,
      condition: b.condition,
      task_id: b.taskId,
      budget: getTask(b.taskId).budget,
      ...rowsFor(p),
      started_at: b.startedAt,
      first_interaction_at: b.firstInteractionAt,
      finished_at: b.finishedAt,
      duration_ms: b.durationMs,
      required_items_found: b.requiredItemsFound,
      within_budget: b.withinBudget,
      total_spent: b.totalSpent,
      extra_items: b.extraItems,
      final_config_id: b.finalConfigId,
      ...configSettings("final", b.finalConfigId),
      plan_steps: ((b.planSnapshot as unknown[]) ?? []).length,
      applied_steps: applied.length,
      applied_configs: b.appliedConfigs,
      cart: b.cart,
      plan_snapshot: b.planSnapshot,
      app_version: sById.get(b.sessionId)!.appVersion,
    };
  });

  // questionnaire_task.csv (long format)
  const instruments = Object.fromEntries(INSTRUMENTS.map((i) => [i, loadInstrument(i)])) as Record<Instrument, ReturnType<typeof loadInstrument>>;
  const qResponses = await prisma.questionnaireResponse.findMany({
    where: { sessionId: { in: sessionIds }, instrument: { in: [...INSTRUMENTS] } },
    orderBy: [{ participantId: "asc" }, { submittedAt: "asc" }],
  });
  const questionnaireRows = qResponses.flatMap((r) => {
    const b = r.taskBlockId ? blockById.get(r.taskBlockId) : undefined;
    const p = pById.get(r.participantId)!;
    const name = r.instrument as Instrument;
    const inst = instruments[name];
    const values = r.responses as Record<string, number>;
    const score = r.score ?? scoreResponses(inst, values);
    return inst.items.filter((item) => item.id in values).map((item) => ({ itemId: item.id, value: values[item.id]!, reverse: !!item.reverse })).map(({ itemId, value, reverse }) => ({
      participant_code: p.code,
      group: p.group,
      block_index: b?.blockIndex,
      interface_number: b ? b.blockIndex + 1 : null,
      condition: b?.condition,
      task_id: b?.taskId,
      instrument: r.instrument,
      instrument_version: r.instrumentVersion,
      item_id: itemId,
      value,
      reverse_coded: name === "sus" ? reverse : null,
      item_contribution: name === "sus" ? (reverse ? 5 - value : value - 1) : value,
      instrument_score: score,
      submitted_at: r.submittedAt,
    }));
  });

  // rankings.csv
  const rankings = await prisma.ranking.findMany({ where: { sessionId: { in: sessionIds } }, orderBy: [{ participantId: "asc" }, { rank: "asc" }] });
  const rankingRows = rankings.map((r) => ({
    participant_code: code(r.participantId),
    group: pById.get(r.participantId)!.group,
    interface_number: r.blockIndex + 1,
    block_index: r.blockIndex,
    condition: r.condition,
    task_id: r.taskId,
    final_config_id: r.finalConfigId,
    rank: r.rank,
    reason: r.reason,
    submitted_at: r.submittedAt,
  }));

  // events.csv
  const events = await prisma.event.findMany({
    where: { sessionId: { in: sessionIds }, ...(filters.includePractice ? {} : { NOT: { isPractice: true, session: { type: "shopping" } } }) },
    orderBy: [{ sessionId: "asc" }, { clientTsMs: "asc" }, { id: "asc" }],
  });
  const eventRows = events.map((e) => ({
    participant_code: code(e.participantId),
    session_type: sById.get(e.sessionId)!.type,
    event_id: e.id,
    client_event_id: e.clientEventId,
    trial_id: e.trialId,
    config_id: e.configId,
    type: e.type,
    client_ts_ms: e.clientTsMs,
    client_ts: e.clientTs,
    server_ts: e.serverTs,
    is_practice: e.isPractice,
    payload: e.payload,
  }));

  // plans.csv and admin_actions.csv
  const frozen = await prisma.frozenModel.findFirst({ where: { status: "active" }, orderBy: { version: "desc" } });
  const kept = new Set(keep.map((p) => p.code));
  const planRows = ((frozen?.results ?? []) as unknown as FrozenResult[])
    .filter((r) => kept.has(r.code))
    .map((r) => ({
      participant_code: r.code,
      is_simulated: r.isSimulated,
      frozen_version: frozen!.version,
      plan_source: r.planSource,
      basis: r.basis,
      sigma: r.sigma,
      cluster_count: r.clusterCount,
      assigned_cluster: r.assignedCluster,
      target_static: r.targets.static,
      target_global: r.targets.global,
      target_cluster5: r.targets.cluster5,
      target_personalFull: r.targets.personalFull,
      unrestricted_personal_target: r.unrestrictedPersonalTarget,
      flag_identical_targets: r.flags.identicalTargets.join(" "),
      flag_agent_mismatch: r.flags.agentMismatch,
      flag_near_tie: r.flags.nearTie.join(" "),
      flag_equals_global: r.flags.equalsGlobal.join(" "),
      flag_attention_failed: r.attentionFailed,
      flag_late: r.late,
    }));
  const actions = await prisma.adminAction.findMany({ orderBy: { at: "asc" } });
  const actionRows = actions.map((a) => ({ at: a.at, action: a.action, reason: a.reason, details: a.details }));

  return {
    "participants.csv": participantsRows,
    "questionnaire_background.csv": backgroundRows,
    "comparison_trials.csv": trialRows,
    "breaks.csv": breakRows,
    "task_trials.csv": taskRows,
    "questionnaire_task.csv": questionnaireRows,
    "rankings.csv": rankingRows,
    "plans.csv": planRows,
    "admin_actions.csv": actionRows,
    "events.csv": eventRows,
  };
}

export function codebook(filters: ExportFilters, counts: Record<string, number>): string {
  const lines = [
    "# Codebook – adaptive-UI preference study export",
    "",
    `Exported: ${new Date().toISOString()}  `,
    `App version: ${process.env.APP_VERSION ?? "unknown"}  `,
    `Filters: completed sessions only = ${filters.completedOnly ? "yes" : "no"}; ` +
      `exclude failed attention = ${filters.excludeFailedAttention ? "yes" : "no"}; include shopping practice task = ${filters.includePractice ? "yes" : "no"}; include simulated = ${filters.includeSimulated ? "yes" : "no"}`,
    "",
    "All files are UTF-8 CSV with a header row and comma separators. Booleans are 1/0; empty cells are missing values;",
    "timestamps are ISO 8601 (UTC) unless the column name ends in `_ms` (epoch milliseconds). JSON columns hold JSON text.",
    "",
    "## Design notes",
    "",
    "- One group of participants, two sessions: Session 1 (`comparison`: paired video comparisons, online or in person) and Session 2 (`shopping`: four shopping tasks with adaptive interfaces, in person). Plans for Session 2 are computed once everyone has finished Session 1 (Freeze & generate).",
    "- Participant codes are P-001, P-002, ... Participants recorded before the codes were renumbered keep their earlier code in `legacy_code`; their answers, choices, timings and timestamps are unchanged.",
    "- SUS (Brooke 1996): the standard 10 items on a 5-point scale (Strongly disagree to Strongly agree). Adaptation: the English items say \"website\" where Brooke says \"system\". The Urdu items are the researchers' own translation, to be replaced by the published Urdu SUS (Anam, Sadiq & Jamil 2020, IJCSIS 18(6), 73-78); `instrument_version` says which wording was answered.",
    "- SEQ (Sauro & Dumas 2009): \"Overall, how easy or difficult was this task?\", 1 (very difficult) to 7 (very easy).",
    `- Config IDs have the form \`${SETTING_KEYS.join("-")}\`; the base configuration is \`${DEFAULT_CONFIG_ID}\`.`,
    "- Each comparison trial shows one scene (product category) in one language in both clips. In Urdu the page is right to left: left_* is Option A, shown on the right.",
    "- Attention checks show the same clip on both sides and ask the participant to choose Option B (choice = right).",
    `- A participant fails the attention criterion if more than ${MAX_FAILED_ATTENTION_CHECKS} attention check(s) are answered wrongly.`,
    "- Repeat trials copy an earlier main trial with sides swapped; consistency compares the chosen clip, not the side.",
    "- `numChangedSettings` is the number of settings in which a clip's target differs from the base config (transition busyness).",
    "- `frozen_model.json` is the active frozen model: settings and seeds, the input-data hash, the pooled models, per-participant leave-one-out summaries (sigma, nuisance terms, weights, targets, flags), the cluster choice and its stability (`clusters`), who was eligible and excluded, and `compromised`, which is true if the freeze was ever broken. `{\"frozen\": false}` if nothing has been frozen.",
    "- Simulated participants have `is_simulated` = 1, and are left out unless the export asks for them.",
    "",
  ];
  for (const t of TABLES) {
    lines.push(`## ${t.file}`, "", `${t.description} Rows in this export: ${counts[t.file] ?? 0}.`, "", "| Column | Description |", "|---|---|");
    for (const c of t.columns) lines.push(`| \`${c.name}\` | ${c.description.replace(/\|/g, "\\|")} |`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function buildExportZip(filters: ExportFilters = {}): Promise<Buffer> {
  const tables = await buildTables(filters);
  const zip = new JSZip();
  const counts: Record<string, number> = {};
  for (const t of TABLES) {
    const rows = tables[t.file] ?? [];
    counts[t.file] = rows.length;
    zip.file(t.file, toCsv(t.file, rows));
  }
  zip.file("codebook.md", codebook(filters, counts));
  const frozen = await prisma.frozenModel.findFirst({ where: { status: "active" }, orderBy: { version: "desc" } });
  zip.file("frozen_model.json", JSON.stringify(frozen ?? { frozen: false }, null, 1));
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
