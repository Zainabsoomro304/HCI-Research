import JSZip from "jszip";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ACTIVE_FREEZE_PHRASE, PLAN_ENGINE } from "@/config/planEngine";
import { CONDITIONS } from "@/config/study";
import { prisma } from "@/lib/db";
import { buildExportZip } from "@/lib/export/build";
import { createParticipants } from "@/lib/participants";
import { freezeAndGenerate, freezeReadiness, generateLatePlan, participantStatus, reinstateParticipant, startFreeze, stepFreeze, unfreeze, withdrawParticipant, type FrozenResult } from "@/lib/prepare/freeze";
import { createSimulatedParticipants, simulateComparison, simulateShopping } from "@/lib/prepare/simulate";
import { savePlanFile } from "@/lib/planStore";
import { numChanged } from "@/lib/planEngine/model";
import { validatePlanFile, type PlanStep } from "@/lib/plans";
import { unlockShopping } from "@/lib/session/shopping";

const SLOW = 600_000;

async function reset() {
  await prisma.participant.deleteMany({});
  await prisma.frozenModel.deleteMany({});
  await prisma.freezeJob.deleteMany({});
  await prisma.adminAction.deleteMany({});
}

async function simulatedCohort(count: number, attentionErrorRate = 0) {
  await createSimulatedParticipants({ count, urduShare: 0.5, seed: 7, attentionErrorRate });
  const people = await prisma.participant.findMany({ where: { isSimulated: true }, orderBy: { number: "asc" } });
  for (const p of people) await simulateComparison(p.id);
  return people;
}

beforeEach(async () => {
  process.env.ALLOW_TEST_TOOLS = "true";
  await reset();
});

afterAll(async () => {
  delete process.env.ALLOW_TEST_TOOLS;
  await reset();
});

describe("test-mode safety", () => {
  it("cannot create or simulate participants with test tools off", async () => {
    await createSimulatedParticipants({ count: 1, urduShare: 1, seed: 1 });
    const person = await prisma.participant.findFirstOrThrow({ where: { isSimulated: true } });
    delete process.env.ALLOW_TEST_TOOLS;
    await expect(createSimulatedParticipants({ count: 1, urduShare: 1, seed: 1 })).rejects.toThrow(/Test tools are off/);
    await expect(simulateComparison(person.id)).rejects.toThrow(/Test tools are off/);
    process.env.ALLOW_TEST_TOOLS = "false";
    await expect(createSimulatedParticipants({ count: 1, urduShare: 1, seed: 1 })).rejects.toThrow(/Test tools are off/);
  });

  it("refuses to freeze with test tools off if any simulated participant exists", async () => {
    await simulatedCohort(2);
    delete process.env.ALLOW_TEST_TOOLS;
    const readiness = await freezeReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join()).toMatch(/simulated participant/);
    await expect(startFreeze()).rejects.toThrow(/simulated participant/);
  });

  it("never touches real participants", async () => {
    const [real] = await createParticipants({ count: 1 });
    await expect(simulateComparison(real!.id)).rejects.toThrow(/not a simulated participant/);
    await expect(simulateShopping(real!.id)).rejects.toThrow(/not a simulated participant/);
  });

  it("marks simulated participants, with codes the plan schema accepts", async () => {
    const [code] = await createSimulatedParticipants({ count: 1, urduShare: 1, seed: 1 });
    expect(code).toMatch(/^P-S\d{3}$/);
    expect((await prisma.participant.findUniqueOrThrow({ where: { code: code! } })).isSimulated).toBe(true);
  });

  it("leaves simulated participants out of exports by default", async () => {
    await simulatedCohort(2);
    const load = async (includeSimulated: boolean) => JSZip.loadAsync(await buildExportZip({ includeSimulated }));
    const without = await (await load(false)).file("participants.csv")!.async("string");
    const withThem = await (await load(true)).file("participants.csv")!.async("string");
    expect(without).not.toContain("P-S");
    expect(withThem).toContain("P-S");
    expect(withThem.split("\n")[0]).toContain("is_simulated");
  });
});

describe("freeze and generate", () => {
  it(
    "handles 32 participants: all plans stored, valid and restricted, within the time budget",
    async () => {
      await simulatedCohort(32);
      const started = Date.now();
      const progress = await startFreeze();
      expect(progress.total).toBe(33);
      let state = progress;
      let steps = 0;
      while (!state.finished) {
        state = await stepFreeze(progress.jobId, 20_000);
        steps++;
      }
      const elapsed = Date.now() - started;
      console.log(`Freeze for 32 participants: ${elapsed} ms in ${steps} step(s)`);
      expect(elapsed).toBeLessThan(180_000);

      expect(await prisma.adaptationPlan.count({ where: { source: "computed" } })).toBe(32 * 4);
      const frozen = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
      expect(frozen.simulatedCount).toBe(32);
      expect(frozen.inputHash).toMatch(/^[0-9a-f]{64}$/);
      const results = frozen.results as unknown as FrozenResult[];
      expect(results).toHaveLength(32);
      for (const r of results) {
        expect(r.basis).toBe("loo");
        expect(r.agent.matches).toBe(true);
        const plans = await prisma.adaptationPlan.findMany({ where: { participantId: r.participantId } });
        const file = Object.fromEntries(plans.map((p) => [p.condition, { steps: p.steps as unknown as PlanStep[] }]));
        expect(validatePlanFile({ participantCode: r.code, conditions: file }).ok).toBe(true);
        expect(file.static!.steps).toEqual([]);
        for (const c of CONDITIONS.filter((x) => x !== "static")) {
          expect(file[c]!.steps).toEqual([{ trigger: { type: "afterMs", value: PLAN_ENGINE.triggerAfterMs }, config: r.targets[c] }]);
          expect(numChanged(r.targets[c])).toBeGreaterThanOrEqual(2);
          expect(numChanged(r.targets[c])).toBeLessThanOrEqual(4);
        }
      }
      expect(await prisma.adminAction.count({ where: { action: "freeze" } })).toBe(1);
      // Clusters: 2 or 3 chosen from the data, each with at least 6 people; choice and stability are stored.
      const report = frozen.clusters as unknown as { poolK: number; poolSizes: number[]; looK: Record<string, number>; meanAgreement: number | null };
      expect(Object.values(report.looK).reduce((a, b) => a + b, 0)).toBe(32);
      if (report.poolK > 1) expect(Math.min(...report.poolSizes)).toBeGreaterThanOrEqual(PLAN_ENGINE.minClusterSize);
      // 32 is a multiple of 16: no Latin-square note.
      expect((frozen.warnings as string[]).join()).not.toMatch(/multiple of 16/);
    },
    SLOW,
  );

  it(
    "a failure during the transaction leaves no partial plans, and no new model",
    async () => {
      await simulatedCohort(5);
      await expect(
        freezeAndGenerate({
          beforeCommit: async () => {
            throw new Error("injected failure");
          },
        }),
      ).rejects.toThrow("injected failure");
      expect(await prisma.adaptationPlan.count()).toBe(0);
      expect(await prisma.frozenModel.count()).toBe(0);
      expect(await prisma.adminAction.count({ where: { action: "freeze" } })).toBe(0);
      const { version } = await freezeAndGenerate();
      expect(version).toBe(1);
      expect(await prisma.adaptationPlan.count()).toBe(5 * 4);
    },
    SLOW,
  );

  it(
    "works with very small groups, using 1 cluster, and notes an unbalanced Latin square without blocking",
    async () => {
      await simulatedCohort(2);
      await freezeAndGenerate();
      const frozen = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
      expect((frozen.warnings as string[]).join()).toMatch(/1 cluster/);
      expect((frozen.results as unknown as FrozenResult[]).every((r) => r.clusterCount === 1)).toBe(true);
      expect((frozen.warnings as string[]).join()).toMatch(/not a multiple of 16/);
    },
    SLOW,
  );

  it(
    "is not ready until every active participant has finished Session 1",
    async () => {
      await simulatedCohort(3);
      const [real] = await createParticipants({ count: 1 });
      let readiness = await freezeReadiness();
      expect(readiness.ready).toBe(false);
      expect(readiness.unfinished.map((r) => r.code)).toEqual([real!.code]);
      await expect(startFreeze()).rejects.toThrow(/have not finished Session 1/);

      await withdrawParticipant(real!.id, "changed their mind");
      readiness = await freezeReadiness();
      expect(readiness.ready).toBe(true);
      expect((await participantStatus()).find((r) => r.id === real!.id)!.status).toBe("withdrawn");
      await freezeAndGenerate();
      const frozen = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
      expect((frozen.excluded as { code: string; reason: string }[])[0]).toMatchObject({ code: real!.code, reason: expect.stringContaining("changed their mind") });
      expect(await prisma.adaptationPlan.count({ where: { participantId: real!.id } })).toBe(0);
      const csv = await (await JSZip.loadAsync(await buildExportZip({ includeSimulated: true }))).file("participants.csv")!.async("string");
      expect(csv).toContain("changed their mind");

      await reinstateParticipant(real!.id);
      expect((await freezeReadiness()).ready).toBe(false);
    },
    SLOW,
  );

  it(
    "leaves attention failures out of the models, and still gives them a flagged plan",
    async () => {
      const people = await simulatedCohort(4);
      const failing = people[0]!;
      const check = await prisma.comparisonTrial.findFirstOrThrow({ where: { participantId: failing.id, isAttentionCheck: true } });
      await prisma.comparisonTrial.update({ where: { id: check.id }, data: { choice: "left", chosenClipId: check.leftClipId } });
      const before = (await prisma.comparisonTrial.findMany({ where: { participantId: failing.id, isPractice: false, isRepeat: false, isAttentionCheck: false } })).length;
      expect(before).toBe(70);
      await freezeAndGenerate();
      const frozen = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
      expect((frozen.eligible as { code: string }[]).map((e) => e.code)).not.toContain(failing.code);
      const result = (frozen.results as unknown as FrozenResult[]).find((r) => r.code === failing.code)!;
      expect(result).toMatchObject({ basis: "pool", attentionFailed: true });
      expect(await prisma.adaptationPlan.count({ where: { participantId: failing.id } })).toBe(4);
    },
    SLOW,
  );
});

describe("freezing rules", () => {
  it(
    "can re-run before any shopping session, is blocked after, and unfreezing takes the phrase, a reason and a permanent flag",
    async () => {
      const people = await simulatedCohort(3);
      expect((await freezeAndGenerate()).version).toBe(1);
      expect((await freezeAndGenerate()).version).toBe(2);
      expect(await prisma.frozenModel.count({ where: { status: "active" } })).toBe(1);
      expect(await prisma.frozenModel.count({ where: { status: "superseded" } })).toBe(1);
      expect(await prisma.adaptationPlan.count()).toBe(3 * 4);
      expect(await prisma.adminAction.count({ where: { action: "freeze" } })).toBe(2);

      const sessionB = await prisma.session.findFirstOrThrow({ where: { participantId: people[0]!.id, type: "shopping" } });
      await unlockShopping(sessionB.id);
      const snapshot = await prisma.taskBlock.findMany({ where: { sessionId: sessionB.id }, orderBy: { blockIndex: "asc" } });
      await expect(startFreeze()).rejects.toThrow(/models are frozen/);

      await expect(unfreeze("please", "typo")).rejects.toThrow(/Type exactly/);
      await expect(unfreeze(ACTIVE_FREEZE_PHRASE, "  ")).rejects.toThrow(/reason is required/);
      await unfreeze(ACTIVE_FREEZE_PHRASE, "a plan was wrong");
      expect((await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } })).compromised).toBe(true);
      expect((await freezeAndGenerate()).version).toBe(3);
      const latest = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
      expect(latest.compromised).toBe(true);
      // The next freeze closes it again, and a started session keeps its snapshot.
      await expect(startFreeze()).rejects.toThrow(/models are frozen/);
      expect(await prisma.taskBlock.findMany({ where: { sessionId: sessionB.id }, orderBy: { blockIndex: "asc" } })).toEqual(snapshot);

      const zip = await JSZip.loadAsync(await buildExportZip({ includeSimulated: true }));
      expect(JSON.parse(await zip.file("frozen_model.json")!.async("string")).compromised).toBe(true);
      expect(await zip.file("admin_actions.csv")!.async("string")).toContain("a plan was wrong");
    },
    SLOW,
  );

  it(
    "gives someone who finishes after the freeze nothing automatically, then a flagged plan from the frozen models",
    async () => {
      await simulatedCohort(3);
      const { version } = await freezeAndGenerate();
      const [lateCode] = await createSimulatedParticipants({ count: 1, urduShare: 1, seed: 9, attentionErrorRate: 0 });
      const late = await prisma.participant.findUniqueOrThrow({ where: { code: lateCode! } });
      await expect(generateLatePlan(late.id)).rejects.toThrow(/has not completed Session 1/);
      await simulateComparison(late.id);
      expect(await prisma.adaptationPlan.count({ where: { participantId: late.id } })).toBe(0);

      const before = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
      await generateLatePlan(late.id);
      const after = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
      expect(after.version).toBe(version);
      expect(after.pool).toEqual(before.pool);
      const result = (after.results as unknown as FrozenResult[]).find((r) => r.code === lateCode)!;
      expect(result).toMatchObject({ late: true, basis: "pool" });
      expect(await prisma.adaptationPlan.count({ where: { participantId: late.id, source: "computed" } })).toBe(4);
      await expect(generateLatePlan(late.id)).rejects.toThrow(/already in the frozen models/);
      expect(await prisma.adminAction.count({ where: { action: "late_plan" } })).toBe(1);
    },
    SLOW,
  );

  it(
    "keeps an uploaded override when re-running, flagged as uploaded",
    async () => {
      const people = await simulatedCohort(3);
      await freezeAndGenerate();
      const code = people[1]!.code;
      const steps = { steps: [{ trigger: { type: "afterMs" as const, value: 8000 }, config: "standard-large-flat-iconText-standard-grid3-none" }] };
      const uploaded = await savePlanFile(people[1]!.id, { participantCode: code, conditions: { static: { steps: [] }, global: steps, cluster5: steps, personalFull: steps } }, "mine.json");
      expect(uploaded.ok).toBe(true);
      await freezeAndGenerate();
      const plans = await prisma.adaptationPlan.findMany({ where: { participantId: people[1]!.id } });
      expect(plans.every((p) => p.source === "uploaded" && p.sourceFileName === "mine.json")).toBe(true);
      const frozen = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
      expect((frozen.results as unknown as FrozenResult[]).find((r) => r.code === code)!.planSource).toBe("uploaded");
    },
    SLOW,
  );
});

describe("shopping session requirements", () => {
  it(
    "needs a completed Session 1 and a plan, and refuses withdrawn participants",
    async () => {
      const [p] = await createParticipants({ count: 1 });
      const sb = p!.sessions.find((s) => s.type === "shopping")!;
      await expect(unlockShopping(sb.id)).rejects.toThrow(/Session 1 \(comparisons\) is not completed/);
      await prisma.session.updateMany({ where: { participantId: p!.id, type: "comparison" }, data: { status: "completed" } });
      await expect(unlockShopping(sb.id)).rejects.toThrow(/Missing adaptation plans/);
      await withdrawParticipant(p!.id, "left the study");
      await expect(unlockShopping(sb.id)).rejects.toThrow(/has withdrawn/);
    },
    SLOW,
  );

  it(
    "simulates a full shopping session that follows the computed plan, with SUS and SEQ scores, and exports the new files",
    async () => {
      const people = await simulatedCohort(3);
      await freezeAndGenerate();
      await simulateShopping(people[0]!.id);
      const session = await prisma.session.findFirstOrThrow({ where: { participantId: people[0]!.id, type: "shopping" } });
      expect(session.status).toBe("completed");
      const blocks = await prisma.taskBlock.findMany({ where: { sessionId: session.id, isPractice: false } });
      const plans = await prisma.adaptationPlan.findMany({ where: { participantId: people[0]!.id } });
      for (const b of blocks) {
        const steps = plans.find((p) => p.condition === b.condition)!.steps as unknown as PlanStep[];
        expect(b.finalConfigId).toBe(steps.at(-1)?.config ?? "standard-standard-flat-iconOnly-standard-grid3-none");
        expect(b.durationMs).toBeGreaterThan(1000);
      }
      expect(await prisma.ranking.count({ where: { sessionId: session.id } })).toBe(4);
      const responses = await prisma.questionnaireResponse.findMany({ where: { sessionId: session.id } });
      expect(responses.map((r) => r.instrument).sort()).toEqual(["seq", "seq", "seq", "seq", "sus", "sus", "sus", "sus"]);
      for (const r of responses) {
        expect(r.score).not.toBeNull();
        if (r.instrument === "sus") expect(r.score! % 2.5).toBe(0);
        if (r.instrument === "seq") expect(r.score!).toBeGreaterThanOrEqual(1);
      }
      expect(await prisma.consentRecord.count({ where: { sessionId: session.id } })).toBe(1);

      const zip = await JSZip.loadAsync(await buildExportZip({ includeSimulated: true }));
      const plansCsv = await zip.file("plans.csv")!.async("string");
      expect(plansCsv.trim().split("\n")).toHaveLength(1 + 3);
      expect(JSON.parse(await zip.file("frozen_model.json")!.async("string")).version).toBe(1);
      expect(await zip.file("codebook.md")!.async("string")).toContain("frozen_model.json");
      expect(await zip.file("admin_actions.csv")!.async("string")).toContain("freeze");
    },
    SLOW,
  );
});
