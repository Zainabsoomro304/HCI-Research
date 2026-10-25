import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { buildExportZip, buildTables, toCsv } from "@/lib/export/build";
import { TABLES } from "@/lib/export/tables";
import { createParticipants } from "@/lib/participants";
import { savePlanFile } from "@/lib/planStore";
import { loadInstrument } from "@/lib/questionnaire/instruments";
import { applyAction, buildState, getSessionByToken } from "@/lib/session";
import { loadConsent } from "@/lib/session/comparison";
import { unlockSessionB } from "@/lib/session/sessionB";
import type { ComparisonState } from "@/lib/session/types";

const bg = { age: 40, gender: "man", occupation: "retired", field: "", csOrIt: "no", techConfidence: 3, shoppingFrequency: "never", prefLayout: "list", prefTextSize: "large", prefDetail: "minimal", prefTheme: "light", prefMenu: "side" };
let p1Code = "";
let p1FailCode = "";
let p3Code = "";

async function act(token: string, body: unknown) {
  await applyAction((await getSessionByToken(token))!, body);
  return buildState((await getSessionByToken(token))!);
}

/** Runs a full comparison session; `wrongAttention` answers attention checks with A. */
async function runComparison(token: string, wrongAttention = false) {
  await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, clientTs: Date.now() });
  await act(token, { type: "background", answers: { ...bg, field: "Sales, \"retail\"" }, clientTs: Date.now() });
  let st = (await act(token, { type: "instructions_done" })) as ComparisonState;
  while (st.step !== "end") {
    if (st.step === "main_intro") st = (await act(token, { type: "main_intro_done" })) as ComparisonState;
    else if (st.step === "break") st = (await act(token, { type: "break_end", clientTs: Date.now() })) as ComparisonState;
    else {
      const choice = st.trial!.question === "chooseB" && !wrongAttention ? "right" : "left";
      const now = Date.now();
      st = (await act(token, { type: "trial", trialId: st.trial!.id, choice, rtMs: 700, replayCount: 0, clientShownAt: now - 5000, clientBothEndedAt: now - 700, clientRespondedAt: now })) as ComparisonState;
    }
  }
}

beforeAll(async () => {
  const [a, b] = await createParticipants({ studyPhase: 1, count: 2, notes: "export test" });
  p1Code = a!.code;
  p1FailCode = b!.code;
  await runComparison(a!.sessions[0]!.token);
  await runComparison(b!.sessions[0]!.token, true);

  const [p3] = await createParticipants({ studyPhase: 3, count: 1 });
  p3Code = p3!.code;
  await savePlanFile(p3!.id, {
    participantCode: p3!.code,
    conditions: {
      static: { steps: [] },
      global: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "grid2-default-partial-light-sidebar" }] },
      cluster5: { steps: [{ trigger: { type: "afterEvents", value: 5 }, config: "grid3-large-partial-dark-dropdown" }] },
      personalFull: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "grid3-default-detailed-dark-dropdown" }] },
    },
  });
  const sb = p3!.sessions.find((s) => s.type === "p3_sessionB")!;
  await unlockSessionB(sb.id);
  await act(sb.token, { type: "welcome_done" });
  await prisma.event.create({
    data: { clientEventId: `practice-ev-${sb.id}`, participantId: p3!.id, sessionId: sb.id, type: "add_to_cart", clientTs: new Date(), clientTsMs: BigInt(Date.now()), isPractice: true, payload: { productId: "fs-05" } },
  });
  await act(sb.token, { type: "task_finish", blockIndex: -1, cart: [], firstInteractionAt: null, finalConfigId: "list-default-detailed-light-sidebar", appliedConfigs: [], clientTs: Date.now() });
  const blocks = await prisma.taskBlock.findMany({ where: { sessionId: sb.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
  const ans = (i: "quis" | "ues_sf") => Object.fromEntries(loadInstrument(i).items.map((it) => [it.id, it.allowNA ? "NA" : it.scale.min]));
  for (const b of blocks) {
    await act(sb.token, { type: "block_intro_done", blockIndex: b.blockIndex });
    await act(sb.token, { type: "task_finish", blockIndex: b.blockIndex, cart: [{ productId: "po-01", quantity: 2 }], firstInteractionAt: Date.now() - 30_000, finalConfigId: "list-default-detailed-light-sidebar", appliedConfigs: [], clientTs: Date.now() });
    await act(sb.token, { type: "questionnaire", blockIndex: b.blockIndex, instrument: "quis", responses: ans("quis") });
    await act(sb.token, { type: "questionnaire", blockIndex: b.blockIndex, instrument: "ues_sf", responses: ans("ues_sf") });
  }
  await act(sb.token, { type: "ranking", ranks: [0, 1, 2, 3].map((b) => ({ blockIndex: b, rank: b + 1, reason: b === 0 ? "liked it, mostly" : "" })) });
}, 180_000);

afterAll(async () => {
  await prisma.$disconnect();
});

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cur += '"'), i++;
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") row.push(cur), (cur = "");
    else if (c === "\n") row.push(cur), rows.push(row), (row = []), (cur = "");
    else cur += c;
  }
  return rows;
}

describe("export", () => {
  it("produces a ZIP with every table and a codebook; headers match the codebook exactly", async () => {
    const zip = await JSZip.loadAsync(await buildExportZip());
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual([...TABLES.map((t) => t.file), "codebook.md"].sort());
    const codebook = await zip.file("codebook.md")!.async("string");
    for (const t of TABLES) {
      const csv = parseCsv(await zip.file(t.file)!.async("string"));
      expect(csv[0], t.file).toEqual(t.columns.map((c) => c.name));
      for (const r of csv.slice(1)) expect(r.length, t.file).toBe(t.columns.length);
      for (const c of t.columns) expect(codebook).toContain(`\`${c.name}\``);
    }
  });

  it("includes the five setting values and busyness for both clips in comparison_trials", async () => {
    const tables = await buildTables({ studyPhase: 1 });
    const row = tables["comparison_trials.csv"]!.find((r) => r.participant_code === p1Code && r.is_practice === false)!;
    for (const side of ["left", "right"]) {
      const id = String(row[`${side}_clip_id`]).split("-");
      expect([row[`${side}_layout`], row[`${side}_fontSize`], row[`${side}_density`], row[`${side}_theme`], row[`${side}_menu`]]).toEqual(id);
      expect(row[`${side}_numChangedSettings`]).toBeGreaterThanOrEqual(2);
    }
    expect(tables["comparison_trials.csv"]!.filter((r) => r.participant_code === p1Code)).toHaveLength(84);
  });

  it("gives repeat trials the gap to their original (and leaves it empty for other trials)", async () => {
    const rows = (await buildTables({ studyPhase: 1 }))["comparison_trials.csv"]!.filter((r) => r.participant_code === p1Code);
    const byId = new Map(rows.map((r) => [r.trial_id, r]));
    const repeats = rows.filter((r) => r.is_repeat === true);
    expect(repeats).toHaveLength(10);
    for (const r of repeats) {
      const orig = byId.get(r.repeat_of_trial_id)!;
      expect(r.repeat_of_trial_index).toBe(orig.trial_index);
      expect(r.repeat_gap).toBe((r.trial_index as number) - (orig.trial_index as number));
      expect(r.repeat_gap as number).toBeGreaterThanOrEqual(20);
    }
    for (const r of rows.filter((r) => r.is_repeat !== true)) {
      expect(r.repeat_gap).toBeNull();
      expect(r.repeat_of_trial_index).toBeNull();
    }
  });

  it("escapes commas and quotes in CSV", async () => {
    const tables = await buildTables({ studyPhase: 1 });
    const csv = toCsv("questionnaire_background.csv", tables["questionnaire_background.csv"]!);
    expect(csv).toContain('"Sales, ""retail"""');
    const parsed = parseCsv(csv);
    // Other test files share the database, so find this test's participant rather than assuming row order.
    const row = parsed.find((r) => r[parsed[0]!.indexOf("participant_code")] === p1Code)!;
    expect(row[parsed[0]!.indexOf("field")]).toBe('Sales, "retail"');
  });

  it("filters by phase, completion and attention, and excludes Session B practice by default", async () => {
    const all = await buildTables();
    const p1 = await buildTables({ studyPhase: 1 });
    expect(p1["participants.csv"]!.every((r) => r.study_phase === 1)).toBe(true);
    expect(all["participants.csv"]!.some((r) => r.participant_code === p3Code)).toBe(true);

    const noFail = await buildTables({ excludeFailedAttention: true });
    const codes = noFail["participants.csv"]!.map((r) => r.participant_code);
    expect(codes).toContain(p1Code);
    expect(codes).not.toContain(p1FailCode);
    expect(all["participants.csv"]!.find((r) => r.participant_code === p1FailCode)!.attention_failed).toBe(true);

    // Completed-only: every included participant has a completed session, and rows only come from completed sessions.
    const unfinished = await createParticipants({ studyPhase: 1, count: 1 });
    const completed = await buildTables({ completedOnly: true });
    const statusCols = ["phase1_status", "sessionA_status", "sessionB_status"];
    expect(completed["participants.csv"]!.every((r) => statusCols.some((c) => r[c] === "completed"))).toBe(true);
    expect(completed["participants.csv"]!.some((r) => r.participant_code === unfinished[0]!.code)).toBe(false);
    expect((await buildTables())["participants.csv"]!.some((r) => r.participant_code === unfinished[0]!.code)).toBe(true);

    const tasks = all["task_trials.csv"]!.filter((r) => r.participant_code === p3Code);
    expect(tasks.map((r) => r.block_index)).toEqual([0, 1, 2, 3]);
    expect(tasks[0]).toMatchObject({ total_spent: 48, extra_items: 1 });
    const withPractice = await buildTables({ includePractice: true });
    expect(withPractice["task_trials.csv"]!.filter((r) => r.participant_code === p3Code)).toHaveLength(5);
    expect(withPractice["events.csv"]!.some((r) => String(r.client_event_id).startsWith("practice-ev-"))).toBe(true);
    expect(all["events.csv"]!.some((r) => String(r.client_event_id).startsWith("practice-ev-"))).toBe(false);

    const q = all["questionnaire_task.csv"]!.filter((r) => r.participant_code === p3Code);
    expect(q.length).toBe(4 * (loadInstrument("quis").items.length + loadInstrument("ues_sf").items.length));
    expect(q.some((r) => r.is_na === true && r.value === null)).toBe(true);
    expect(q.some((r) => r.reverse_coded === true)).toBe(true);
    const ranks = all["rankings.csv"]!.filter((r) => r.participant_code === p3Code);
    expect(ranks.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(ranks[0]!.reason).toBe("liked it, mostly");
    expect(all["breaks.csv"]!.filter((r) => r.participant_code === p1Code)).toHaveLength(2);
  });
});
