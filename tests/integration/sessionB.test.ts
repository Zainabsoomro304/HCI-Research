import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { latinRows, blockAssignments } from "@/lib/latinSquare";
import { createParticipants } from "@/lib/participants";
import { savePlanFile } from "@/lib/planStore";
import { loadInstrument } from "@/lib/questionnaire/instruments";
import { ActionError, applyAction, buildState, getSessionByToken } from "@/lib/session";
import { unlockSessionB } from "@/lib/session/sessionB";
import type { SessionBState } from "@/lib/session/sessionBTypes";
import { getTask } from "@/lib/tasks";

afterAll(async () => {
  await prisma.$disconnect();
});

const planFor = (code: string) => ({
  participantCode: code,
  conditions: {
    static: { steps: [] },
    global: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "grid2-default-partial-light-sidebar" }] },
    cluster5: { steps: [{ trigger: { type: "afterEvents", value: 5 }, config: "grid3-large-partial-dark-dropdown" }] },
    personalFull: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "grid3-default-detailed-dark-dropdown" }] },
  },
});

async function state(token: string) {
  return (await buildState((await getSessionByToken(token))!)) as SessionBState;
}
async function act(token: string, body: unknown) {
  await applyAction((await getSessionByToken(token))!, body);
  return state(token);
}
function answers(instrument: "quis" | "ues_sf") {
  const inst = loadInstrument(instrument);
  return Object.fromEntries(inst.items.map((i) => [i.id, i.scale.min + Math.floor(i.scale.points / 2)]));
}

describe("Session B", () => {
  it("stays locked until unlocked, and cannot be unlocked without all 4 plans", async () => {
    const [p] = await createParticipants({ studyPhase: 3, count: 1 });
    const sb = p!.sessions.find((s) => s.type === "p3_sessionB")!;
    expect((await state(sb.token)).step).toBe("locked");
    await expect(act(sb.token, { type: "welcome_done" })).rejects.toBeInstanceOf(ActionError);
    await expect(unlockSessionB(sb.id)).rejects.toThrow(/Missing adaptation plans/);
    const wrong = await savePlanFile(p!.id, planFor("P3-999"));
    expect(wrong.ok).toBe(false);
  });

  it("runs the full session with Latin-square blocks, scoring, questionnaires and ranking", async () => {
    const [p] = await createParticipants({ studyPhase: 3, count: 1 });
    const sb = p!.sessions.find((s) => s.type === "p3_sessionB")!;
    expect((await savePlanFile(p!.id, planFor(p!.code), "plan.json")).ok).toBe(true);
    await unlockSessionB(sb.id);

    const blocks = await prisma.taskBlock.findMany({ where: { sessionId: sb.id }, orderBy: { blockIndex: "asc" } });
    expect(blocks).toHaveLength(5);
    const { conditionRow, taskRow } = latinRows(p!.number);
    expect(blocks.filter((b) => !b.isPractice).map((b) => [b.condition, b.taskId])).toEqual(
      blockAssignments(conditionRow, taskRow).map((b) => [b.condition, b.taskId]),
    );
    expect((await prisma.session.findUnique({ where: { id: sb.id } }))!.conditionRow).toBe(conditionRow);

    let st = await state(sb.token);
    expect(st.step).toBe("welcome");
    st = await act(sb.token, { type: "welcome_done" });
    expect(st.step).toBe("practice_task");
    expect(st.block!.isPractice).toBe(true);
    st = await act(sb.token, {
      type: "task_finish", blockIndex: -1, cart: [{ productId: "fs-05", quantity: 1 }], firstInteractionAt: Date.now() - 5000,
      finalConfigId: "list-default-detailed-light-sidebar", appliedConfigs: [], clientTs: Date.now(),
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
      const last = st.block!.steps.at(-1)?.config ?? "list-default-detailed-light-sidebar";
      st = await act(sb.token, {
        type: "task_finish", blockIndex: bi, cart, firstInteractionAt: Date.now() - 60_000, finalConfigId: last,
        appliedConfigs: st.block!.steps.map((s, i) => ({ step: i + 1, configId: s.config, atMs: 8000 })), clientTs: Date.now(),
      });
      expect(st.step).toBe("quis");
      expect(st.questionnaire!.items.length).toBeGreaterThan(0);
      await expect(act(sb.token, { type: "questionnaire", blockIndex: bi, instrument: "quis", responses: {} })).rejects.toMatchObject({ status: 400 });
      st = await act(sb.token, { type: "questionnaire", blockIndex: bi, instrument: "quis", responses: { ...answers("quis"), quis_01: "NA" } });
      expect(st.step).toBe("ues_sf");
      st = await act(sb.token, { type: "questionnaire", blockIndex: bi, instrument: "ues_sf", responses: answers("ues_sf") });
    }
    expect(st.step).toBe("ranking");
    expect(st.ranking!.interfaces.map((i) => i.number)).toEqual([1, 2, 3, 4]);
    for (const i of st.ranking!.interfaces) expect(i.imageUrl).toMatch(/^\/m\/[0-9a-f]{16}\.png$/);
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
    expect(await prisma.questionnaireResponse.count({ where: { sessionId: sb.id } })).toBe(8);
    const ranks = await prisma.ranking.findMany({ where: { sessionId: sb.id }, orderBy: { rank: "asc" } });
    expect(ranks.map((r) => r.blockIndex)).toEqual([3, 2, 1, 0]);
    expect(ranks[0]!.reason).toBe("Easy to read");
    expect((await prisma.session.findUnique({ where: { id: sb.id } }))!.status).toBe("completed");
  });

  it("reconstructs cart and adaptation progress of an interrupted task from events", async () => {
    const [p] = await createParticipants({ studyPhase: 3, count: 1 });
    const sb = p!.sessions.find((s) => s.type === "p3_sessionB")!;
    await savePlanFile(p!.id, planFor(p!.code));
    await unlockSessionB(sb.id);
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
        ev(1, "add_to_cart", { productId: "fs-05", quantity: 1 }),
        ev(2, "add_to_cart", { productId: "fs-05", quantity: 2 }),
        ev(3, "add_to_cart", { productId: "kt-03", quantity: 1 }),
        ev(4, "quantity_change", { productId: "fs-05", from: 2, to: 3 }),
        ev(5, "adaptation_applied", { from: "a", to: "grid2-default-partial-light-sidebar", stepIndex: 1, atMs: 8000 }),
        ev(6, "remove_from_cart", { productId: "kt-03", quantity: 1 }),
        ev(7, "category_select", { category: "Kitchen" }),
      ],
    });
    const resumed = await state(sb.token);
    expect(resumed.block!.resume!.cart).toEqual([{ productId: "fs-05", quantity: 3 }]);
    expect(resumed.block!.resume!.appliedSteps).toBe(1);
    expect(resumed.block!.resume!.eventsSinceLast).toBe(2);
    expect(resumed.block!.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
