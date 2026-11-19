import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { latinRows, blockAssignments } from "@/lib/latinSquare";
import { createParticipants } from "@/lib/participants";
import { savePlanFile } from "@/lib/planStore";
import { itemScale, loadInstrument } from "@/lib/questionnaire/instruments";
import { loadConsent } from "@/lib/session/comparison";
import { CONFIRMED } from "./fixtures";
import { ActionError, applyAction, buildState, getSessionByToken } from "@/lib/session";
import { unlockShopping } from "@/lib/session/shopping";
import type { ShoppingState } from "@/lib/session/shoppingTypes";
import { getTask } from "@/lib/tasks";

afterAll(async () => {
  await prisma.$disconnect();
});

const planFor = (code: string) => ({
  participantCode: code,
  conditions: {
    static: { steps: [] },
    global: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "standard-large-flat-iconText-standard-grid3-none" }] },
    cluster5: { steps: [{ trigger: { type: "afterEvents", value: 5 }, config: "large-large-flat-iconText-high-grid3-none" }] },
    personalFull: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "standard-standard-flat-iconOnly-high-grid3-hints" }] },
  },
});

async function state(token: string) {
  return (await buildState((await getSessionByToken(token))!)) as ShoppingState;
}
async function act(token: string, body: unknown) {
  await applyAction((await getSessionByToken(token))!, body);
  return state(token);
}
function answers(instrument: "seq" | "sus") {
  const inst = loadInstrument(instrument);
  return Object.fromEntries(inst.items.map((i) => [i.id, itemScale(inst, i).min + Math.floor(itemScale(inst, i).points / 2)]));
}
const consent = (lang = "en") => ({ type: "consent", agreed: true, hash: loadConsent(lang).hash, confirmations: CONFIRMED, clientTs: Date.now() });

describe("shopping session (Session 2)", () => {
  it("stays locked until unlocked, and cannot be unlocked without all 4 plans", async () => {
    const [p] = await createParticipants({ count: 1 });
    const sb = p!.sessions.find((s) => s.type === "shopping")!;
    expect((await state(sb.token)).step).toBe("locked");
    await expect(act(sb.token, { type: "welcome_done" })).rejects.toBeInstanceOf(ActionError);
    await expect(unlockShopping(sb.id)).rejects.toThrow(/Session 1 \(comparisons\) is not completed/);
    await prisma.session.updateMany({ where: { participantId: p!.id, type: "comparison" }, data: { status: "completed" } });
    await expect(unlockShopping(sb.id)).rejects.toThrow(/Missing adaptation plans/);
    const wrong = await savePlanFile(p!.id, planFor("P-999"));
    expect(wrong.ok).toBe(false);
  });

  it("runs the full session with Latin-square blocks, scoring, questionnaires and ranking", async () => {
    const [p] = await createParticipants({ count: 1 });
    const sb = p!.sessions.find((s) => s.type === "shopping")!;
    expect((await savePlanFile(p!.id, planFor(p!.code), "plan.json")).ok).toBe(true);
    await prisma.session.updateMany({ where: { participantId: p!.id, type: "comparison" }, data: { status: "completed" } });
    await unlockShopping(sb.id);

    const blocks = await prisma.taskBlock.findMany({ where: { sessionId: sb.id }, orderBy: { blockIndex: "asc" } });
    expect(blocks).toHaveLength(5);
    const { conditionRow, taskRow } = latinRows(p!.number);
    expect(blocks.filter((b) => !b.isPractice).map((b) => [b.condition, b.taskId])).toEqual(
      blockAssignments(conditionRow, taskRow).map((b) => [b.condition, b.taskId]),
    );
    expect((await prisma.session.findUnique({ where: { id: sb.id } }))!.conditionRow).toBe(conditionRow);

    let st = await state(sb.token);
    expect(st.step).toBe("consent");
    expect(st.consent!.markdown).toContain("Example University");
    await expect(act(sb.token, { type: "welcome_done" })).rejects.toBeInstanceOf(ActionError);
    await expect(act(sb.token, { ...consent(), confirmations: { ...CONFIRMED, agree: false } })).rejects.toMatchObject({ status: 400 });
    st = await act(sb.token, consent());
    expect(st.step).toBe("welcome");
    // The re-confirmation is stored for this session; the Session 1 consent is not touched.
    const records = await prisma.consentRecord.findMany({ where: { participantId: p!.id } });
    expect(records.map((r) => r.sessionId)).toEqual([sb.id]);
    st = await act(sb.token, { type: "welcome_done" });
    expect(st.step).toBe("practice_task");
    expect(st.block!.isPractice).toBe(true);
    st = await act(sb.token, {
      type: "task_finish", blockIndex: -1, cart: [{ productId: "fv-01", quantity: 1 }], firstInteractionAt: Date.now() - 5000,
      finalConfigId: "standard-standard-flat-iconOnly-standard-grid3-none", appliedConfigs: [], clientTs: Date.now(),
    });
    expect(st.step).toBe("block_intro");

    for (let bi = 0; bi < 4; bi++) {
      expect(st.step).toBe("block_intro");
      expect(st.block!.number).toBe(bi + 1);
      st = await act(sb.token, { type: "block_intro_done", blockIndex: bi });
      expect(st.step).toBe("task");
      // The participant-facing state never reveals the condition.
      const json = JSON.stringify(st);
      for (const c of ["static", "global", "cluster5", "personalFull", "condition"]) expect(json).not.toContain(c);
      const task = getTask(blocks[bi + 1]!.taskId);
      const cart = task.requiredItems.slice(0, 5).map((i) => ({ productId: i.candidateProductIds[0]!, quantity: 1 }));
      const last = st.block!.steps.at(-1)?.config ?? "standard-standard-flat-iconOnly-standard-grid3-none";
      st = await act(sb.token, {
        type: "task_finish", blockIndex: bi, cart, firstInteractionAt: Date.now() - 60_000, finalConfigId: last,
        appliedConfigs: st.block!.steps.map((s, i) => ({ step: i + 1, configId: s.config, atMs: 8000 })), clientTs: Date.now(),
      });
      expect(st.step).toBe("seq");
      expect(st.questionnaire!.items).toHaveLength(1);
      expect(st.questionnaire!.scale.points).toBe(7);
      await expect(act(sb.token, { type: "questionnaire", blockIndex: bi, instrument: "seq", responses: {} })).rejects.toMatchObject({ status: 400 });
      await expect(act(sb.token, { type: "questionnaire", blockIndex: bi, instrument: "sus", responses: answers("sus") })).rejects.toBeInstanceOf(ActionError);
      st = await act(sb.token, { type: "questionnaire", blockIndex: bi, instrument: "seq", responses: { seq_01: 6 } });
      expect(st.step).toBe("sus");
      expect(st.questionnaire!.items).toHaveLength(10);
      await expect(act(sb.token, { type: "questionnaire", blockIndex: bi, instrument: "sus", responses: { ...answers("sus"), sus_01: 6 } })).rejects.toMatchObject({ status: 400 });
      st = await act(sb.token, { type: "questionnaire", blockIndex: bi, instrument: "sus", responses: { sus_01: 4, sus_02: 2, sus_03: 5, sus_04: 1, sus_05: 4, sus_06: 2, sus_07: 5, sus_08: 1, sus_09: 4, sus_10: 2 } });
    }
    expect(st.step).toBe("ranking");
    expect(st.ranking!.interfaces.map((i) => i.number)).toEqual([1, 2, 3, 4]);
    for (const i of st.ranking!.interfaces) expect(i.imageUrl).toMatch(/^\/m\/[0-9a-f]{20}\.jpg$/);
    await expect(act(sb.token, { type: "ranking", ranks: [0, 1, 2, 3].map((b) => ({ blockIndex: b, rank: 1, reason: "" })) })).rejects.toMatchObject({ status: 400 });
    st = await act(sb.token, { type: "ranking", ranks: [0, 1, 2, 3].map((b) => ({ blockIndex: b, rank: 4 - b, reason: b === 3 ? "Easy to read" : "" })) });
    expect(st.step).toBe("end");

    const done = await prisma.taskBlock.findMany({ where: { sessionId: sb.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
    for (const b of done) {
      expect(b.requiredItemsFound).toBe(5);
      expect(b.durationMs).toBeGreaterThanOrEqual(59_000);
      expect(b.totalSpent).toBeGreaterThan(0);
      expect(b.withinBudget).not.toBeNull();
      expect(b.extraItems).toBe(0);
    }
    const responses = await prisma.questionnaireResponse.findMany({ where: { sessionId: sb.id }, orderBy: { submittedAt: "asc" } });
    expect(responses.map((r) => r.instrument)).toEqual(["seq", "sus", "seq", "sus", "seq", "sus", "seq", "sus"]);
    // Item answers are stored as given, with the score next to them: SEQ = the value, SUS = 85 for these answers.
    expect(responses.map((r) => r.score)).toEqual([6, 85, 6, 85, 6, 85, 6, 85]);
    expect(responses[1]!.responses).toMatchObject({ sus_01: 4, sus_02: 2 });
    const ranks = await prisma.ranking.findMany({ where: { sessionId: sb.id }, orderBy: { rank: "asc" } });
    expect(ranks.map((r) => r.blockIndex)).toEqual([3, 2, 1, 0]);
    expect(ranks[0]!.reason).toBe("Easy to read");
    expect((await prisma.session.findUnique({ where: { id: sb.id } }))!.status).toBe("completed");
  });

  it("reconstructs cart and adaptation progress of an interrupted task from events", async () => {
    const [p] = await createParticipants({ count: 1 });
    const sb = p!.sessions.find((s) => s.type === "shopping")!;
    await savePlanFile(p!.id, planFor(p!.code));
    await prisma.session.updateMany({ where: { participantId: p!.id, type: "comparison" }, data: { status: "completed" } });
    await unlockShopping(sb.id);
    await act(sb.token, consent());
    await act(sb.token, { type: "welcome_done" });
    const st = await state(sb.token);
    const blockId = st.block!.blockId;
    const base = Date.now();
    const ev = (i: number, type: string, payload: object) => ({
      clientEventId: `recon-${blockId}-${i}`, participantId: p!.id, sessionId: sb.id, trialId: blockId, type,
      clientTs: new Date(base + i), clientTsMs: BigInt(base + i), payload, isPractice: true,
    });
    await prisma.event.createMany({
      data: [
        ev(1, "add_to_cart", { productId: "fv-01", quantity: 1 }),
        ev(2, "add_to_cart", { productId: "fv-01", quantity: 2 }),
        ev(3, "add_to_cart", { productId: "da-01", quantity: 1 }),
        ev(4, "quantity_change", { productId: "fv-01", from: 2, to: 3 }),
        ev(5, "adaptation_applied", { from: "a", to: "standard-large-flat-iconText-standard-grid3-none", stepIndex: 1, atMs: 8000 }),
        ev(6, "remove_from_cart", { productId: "da-01", quantity: 1 }),
        ev(7, "category_select", { category: "Kitchen" }),
      ],
    });
    const resumed = await state(sb.token);
    expect(resumed.block!.resume!.cart).toEqual([{ productId: "fv-01", quantity: 3 }]);
    expect(resumed.block!.resume!.appliedSteps).toBe(1);
    expect(resumed.block!.resume!.eventsSinceLast).toBe(2);
    expect(resumed.block!.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
