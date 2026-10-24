/**
 * Session B (Phase 3, in person): researcher unlocks -> welcome -> practice task -> 4 x (intro, task, QUIS, UES-SF)
 * -> final ranking -> end. Condition and task orders follow two balanced Latin squares (stored on the session).
 */
import type { Participant, Prisma, Session } from "@prisma/client";
import { z } from "zod";
import { CONDITIONS, DELIBERATE_EVENT_TYPES } from "@/config/study";
import { DEFAULT_CONFIG_ID, isConfigId } from "@/config/uiSpace";
import { productsById } from "../catalog";
import { prisma } from "../db";
import { blockAssignments, latinRows } from "../latinSquare";
import { stillUrl } from "../media";
import { PlanStepSchema, type PlanStep } from "../plans";
import { loadInstrument, validateResponses } from "../questionnaire/instruments";
import { PRACTICE_TASK, getTask, scoreTask } from "../tasks";
import { ActionError } from "./comparison";
import { SessionBActionSchema, type BlockView, type SessionBState, type SessionBStep } from "./sessionBTypes";

type S = Session & { participant: Participant };
const BLOCKS = 4;
const DELIBERATE = new Set<string>(DELIBERATE_EVENT_TYPES);
/** Events that are not user interactions (excluded when finding the first interaction). */
const PASSIVE = new Set(["page_view", "adaptation_applied", "task_start", "task_finish", "visibility_change"]);

/** Returns the conditions that still lack an uploaded plan (empty = ready). */
export async function missingPlans(participantId: string): Promise<string[]> {
  const plans = await prisma.adaptationPlan.findMany({ where: { participantId }, select: { condition: true } });
  const have = new Set(plans.map((p) => p.condition));
  return CONDITIONS.filter((c) => !have.has(c));
}

/**
 * Called by the researcher (admin panel). Requires all 4 plans. Creates the practice block and the 4 task blocks
 * with frozen plan snapshots and the Latin-square assignment. Idempotent.
 */
export async function unlockSessionB(sessionId: string) {
  const s = await prisma.session.findUnique({ where: { id: sessionId }, include: { participant: true } });
  if (!s || s.type !== "p3_sessionB") throw new ActionError("Not a Session B", 404);
  if (s.unlockedAt) return s;
  const missing = await missingPlans(s.participantId);
  if (missing.length) throw new ActionError(`Missing adaptation plans: ${missing.join(", ")}`);
  const { conditionRow, taskRow } = latinRows(s.participant.number, {
    conditionRow: s.participant.conditionRowOverride,
    taskRow: s.participant.taskRowOverride,
  });
  const plans = await prisma.adaptationPlan.findMany({ where: { participantId: s.participantId } });
  const planFor = new Map(plans.map((p) => [p.condition, p.steps as Prisma.JsonArray]));
  return prisma.$transaction(async (tx) => {
    await tx.taskBlock.create({
      data: { participantId: s.participantId, sessionId: s.id, blockIndex: -1, isPractice: true, condition: "practice", taskId: PRACTICE_TASK.id, planSnapshot: [] },
    });
    for (const b of blockAssignments(conditionRow, taskRow))
      await tx.taskBlock.create({
        data: { participantId: s.participantId, sessionId: s.id, blockIndex: b.blockIndex, condition: b.condition, taskId: b.taskId, planSnapshot: planFor.get(b.condition) ?? [] },
      });
    return tx.session.update({ where: { id: s.id }, data: { unlockedAt: new Date(), conditionRow, taskRow, currentStep: "welcome", currentIndex: 0 } });
  });
}

function parseSteps(json: Prisma.JsonValue): PlanStep[] {
  return z.array(PlanStepSchema).parse(json ?? []);
}

/** Rebuilds cart and adaptation progress of an interrupted task from its logged events (undefined if none). */
async function reconstruct(blockId: string): Promise<BlockView["resume"]> {
  const events = await prisma.event.findMany({ where: { trialId: blockId }, orderBy: [{ clientTsMs: "asc" }, { id: "asc" }] });
  if (events.length === 0) return undefined; // nothing logged yet: a fresh start
  const cart = new Map<string, number>();
  let appliedSteps = 0;
  let eventsSinceLast = 0;
  const appliedConfigs: { step: number; configId: string; atMs: number }[] = [];
  let firstInteractionAt: number | null = null;
  for (const e of events) {
    if (firstInteractionAt === null && !PASSIVE.has(e.type)) firstInteractionAt = Number(e.clientTsMs);
    const p = (e.payload ?? {}) as Record<string, unknown>;
    const id = typeof p.productId === "string" ? p.productId : null;
    if (e.type === "add_to_cart" && id && typeof p.quantity === "number") cart.set(id, p.quantity);
    if (e.type === "quantity_change" && id && typeof p.to === "number") cart.set(id, p.to);
    if (e.type === "remove_from_cart" && id) cart.delete(id);
    if (e.type === "adaptation_applied" && typeof p.stepIndex === "number") {
      appliedSteps = Math.max(appliedSteps, p.stepIndex);
      eventsSinceLast = 0;
      if (typeof p.to === "string") appliedConfigs.push({ step: p.stepIndex, configId: p.to, atMs: typeof p.atMs === "number" ? p.atMs : 0 });
    } else if (DELIBERATE.has(e.type)) eventsSinceLast++;
  }
  return {
    cart: [...cart].filter(([, q]) => q > 0).map(([productId, quantity]) => ({ productId, quantity })),
    appliedSteps,
    eventsSinceLast,
    appliedConfigs,
    firstInteractionAt,
  };
}

export async function buildSessionBState(s: S): Promise<SessionBState> {
  const step = s.currentStep as SessionBStep;
  const state: SessionBState = { kind: "sessionB", step: s.unlockedAt ? step : "locked", lang: s.participant.language, totalBlocks: BLOCKS };
  if (!s.unlockedAt) return state;

  if (step === "practice_task" || step === "block_intro" || step === "task") {
    const blockIndex = step === "practice_task" ? -1 : s.currentIndex;
    const b = await prisma.taskBlock.findUnique({ where: { sessionId_blockIndex: { sessionId: s.id, blockIndex } } });
    if (b) {
      const task = getTask(b.taskId);
      state.block = {
        blockId: b.id,
        blockIndex,
        number: blockIndex + 1,
        isPractice: b.isPractice,
        task: { title: task.title, instructions: task.instructions, budget: task.budget, requiredItems: task.requiredItems.map((i) => ({ id: i.id, description: i.description })) },
        steps: step === "block_intro" ? [] : parseSteps(b.planSnapshot),
        elapsedMs: b.startedAt ? Date.now() - b.startedAt.getTime() : null,
        resume: b.startedAt ? await reconstruct(b.id) : undefined,
      };
    }
  }
  if (step === "quis" || step === "ues_sf") {
    const inst = loadInstrument(step, s.participant.language);
    state.questionnaire = { instrument: step, blockIndex: s.currentIndex, number: s.currentIndex + 1, title: inst.title, instructions: inst.instructions, items: inst.items };
  }
  if (step === "ranking") {
    const blocks = await prisma.taskBlock.findMany({ where: { sessionId: s.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
    state.ranking = { interfaces: blocks.map((b) => ({ blockIndex: b.blockIndex, number: b.blockIndex + 1, imageUrl: stillUrl(b.finalConfigId ?? DEFAULT_CONFIG_ID) })) };
  }
  return state;
}

function expectStep(s: Session, ...steps: SessionBStep[]) {
  if (!s.unlockedAt) throw new ActionError("Session B has not been started by the researcher yet");
  if (!steps.includes(s.currentStep as SessionBStep)) throw new ActionError(`Action not allowed in step "${s.currentStep}"`);
}

export async function applySessionBAction(s: S, body: unknown): Promise<void> {
  const parsed = SessionBActionSchema.safeParse(body);
  if (!parsed.success) throw new ActionError(z.prettifyError(parsed.error), 400);
  const action = parsed.data;
  const now = new Date();
  switch (action.type) {
    case "start":
      await prisma.session.update({
        where: { id: s.id },
        data: {
          startedAt: s.startedAt ?? (s.unlockedAt ? now : null),
          status: s.status === "completed" ? "completed" : s.unlockedAt ? "in_progress" : s.status,
          appVersion: s.appVersion ?? process.env.APP_VERSION ?? "unknown",
          userAgent: action.userAgent,
          viewportW: action.viewport.w,
          viewportH: action.viewport.h,
          lastSeenAt: now,
        },
      });
      return;
    case "welcome_done":
      expectStep(s, "welcome");
      await prisma.$transaction([
        prisma.taskBlock.update({ where: { sessionId_blockIndex: { sessionId: s.id, blockIndex: -1 } }, data: { startedAt: now } }),
        prisma.session.update({ where: { id: s.id }, data: { currentStep: "practice_task", status: "in_progress", startedAt: s.startedAt ?? now } }),
      ]);
      return;
    case "block_intro_done":
      expectStep(s, "block_intro");
      if (action.blockIndex !== s.currentIndex) throw new ActionError("Not the current block");
      await prisma.$transaction([
        prisma.taskBlock.updateMany({ where: { sessionId: s.id, blockIndex: action.blockIndex, startedAt: null }, data: { startedAt: now } }),
        prisma.session.update({ where: { id: s.id }, data: { currentStep: "task" } }),
      ]);
      return;
    case "task_finish": {
      const isPractice = action.blockIndex === -1;
      expectStep(s, isPractice ? "practice_task" : "task");
      if (!isPractice && action.blockIndex !== s.currentIndex) throw new ActionError("Not the current block");
      for (const l of action.cart) if (!productsById.has(l.productId)) throw new ActionError(`Unknown product ${l.productId}`, 400);
      if (!isConfigId(action.finalConfigId)) throw new ActionError("Invalid final config", 400);
      const block = await prisma.taskBlock.findUnique({ where: { sessionId_blockIndex: { sessionId: s.id, blockIndex: action.blockIndex } } });
      if (!block) throw new ActionError("Unknown block", 404);
      const score = scoreTask(getTask(block.taskId), action.cart);
      const started = block.startedAt ?? now;
      const firstInteraction = action.firstInteractionAt ? new Date(action.firstInteractionAt) : null;
      await prisma.$transaction([
        prisma.taskBlock.update({
          where: { id: block.id },
          data: {
            cart: action.cart.map((l) => ({ ...l, price: productsById.get(l.productId)!.price })),
            appliedConfigs: action.appliedConfigs,
            finalConfigId: action.finalConfigId,
            firstInteractionAt: firstInteraction,
            finishedAt: now,
            ...score,
            // From the first interaction to "Finish task" (client clock for both ends); falls back to task start.
            durationMs: firstInteraction ? Math.max(0, action.clientTs - firstInteraction.getTime()) : now.getTime() - started.getTime(),
          },
        }),
        prisma.session.update({
          where: { id: s.id },
          data: isPractice ? { currentStep: "block_intro", currentIndex: 0 } : { currentStep: "quis" },
        }),
      ]);
      return;
    }
    case "questionnaire": {
      expectStep(s, action.instrument);
      if (action.blockIndex !== s.currentIndex) throw new ActionError("Not the current block");
      const inst = loadInstrument(action.instrument, s.participant.language);
      const v = validateResponses(inst, action.responses);
      if (!v.ok) throw new ActionError(v.error, 400);
      const block = await prisma.taskBlock.findUniqueOrThrow({ where: { sessionId_blockIndex: { sessionId: s.id, blockIndex: action.blockIndex } } });
      const last = action.blockIndex === BLOCKS - 1;
      const next: Prisma.SessionUpdateInput =
        action.instrument === "quis" ? { currentStep: "ues_sf" } : last ? { currentStep: "ranking" } : { currentStep: "block_intro", currentIndex: action.blockIndex + 1 };
      await prisma.$transaction([
        prisma.questionnaireResponse.create({
          data: {
            participantId: s.participantId,
            sessionId: s.id,
            taskBlockId: block.id,
            instrument: action.instrument,
            instrumentVersion: `${inst.version}#${inst.hash}`,
            responses: v.value,
          },
        }),
        prisma.session.update({ where: { id: s.id }, data: next }),
      ]);
      return;
    }
    case "ranking": {
      expectStep(s, "ranking");
      const ranks = action.ranks;
      if (new Set(ranks.map((r) => r.blockIndex)).size !== 4 || new Set(ranks.map((r) => r.rank)).size !== 4) throw new ActionError("Ranking must be a permutation", 400);
      const blocks = await prisma.taskBlock.findMany({ where: { sessionId: s.id, isPractice: false } });
      await prisma.$transaction([
        ...ranks.map((r) => {
          const b = blocks.find((x) => x.blockIndex === r.blockIndex)!;
          return prisma.ranking.create({
            data: {
              participantId: s.participantId,
              sessionId: s.id,
              blockIndex: r.blockIndex,
              condition: b.condition,
              taskId: b.taskId,
              finalConfigId: b.finalConfigId ?? DEFAULT_CONFIG_ID,
              rank: r.rank,
              reason: r.reason.trim() || null,
            },
          });
        }),
        prisma.session.update({ where: { id: s.id }, data: { currentStep: "end", status: "completed", completedAt: now } }),
      ]);
      return;
    }
  }
}
