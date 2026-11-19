/**
 * Preparing the shopping sessions: who is ready, and "Freeze models & generate plans".
 *
 * The computation runs in chunks so it can never hit a serverless time limit: each request computes for a limited time
 * and saves its progress in a FreezeJob, which never touches plans. The plans and the frozen model are written in one
 * transaction at the very end, so a failed or abandoned run leaves nothing behind.
 */
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { ACTIVE_FREEZE_PHRASE, PLAN_ENGINE } from "@/config/planEngine";
import { CONDITIONS, LATIN_BALANCE_GROUP, type Condition } from "@/config/study";
import { computeQuality } from "../admin/quality";
import { prisma } from "../db";
import { sessionLink } from "../participants";
import { clusterReport, computeLeaveOneOut, computePool, engineWarnings, planFile, planFromPool, type EngineParticipant, type ParticipantModels, type SharedModels } from "../planEngine/engine";
import { validatePlanFile } from "../plans";

export function testToolsEnabled(): boolean {
  return process.env.ALLOW_TEST_TOOLS === "true";
}

export class FreezeError extends Error {}

export type ParticipantStatus = "completed" | "in_progress" | "not_started" | "withdrawn";

export interface StatusRow {
  id: string;
  code: string;
  isSimulated: boolean;
  group: string;
  status: ParticipantStatus;
  comparisonId: string | null;
  comparisonLink: string | null;
  comparisonLabel: string;
  shoppingId: string | null;
  shoppingLink: string | null;
  shoppingUnlocked: boolean;
  shoppingStatus: string | null;
  attentionFailed: boolean;
  withdrawnReason: string | null;
  plansSource: string | null;
  plansCount: number;
}

export interface FrozenResult extends ParticipantModels {
  participantId: string;
  isSimulated: boolean;
  attentionFailed: boolean;
  late: boolean;
  /** "computed", or "uploaded" when a hand-uploaded override was kept instead. */
  planSource: string;
}

export interface ExcludedEntry {
  code: string;
  reason: string;
}

export async function participantStatus(): Promise<StatusRow[]> {
  const participants = await prisma.participant.findMany({
    orderBy: { number: "asc" },
    include: {
      sessions: true,
      plans: { select: { condition: true, source: true } },
      trials: { select: { id: true, isAttentionCheck: true, isRepeat: true, repeatOfTrialId: true, choice: true, chosenClipId: true } },
    },
  });
  return participants.map((p) => {
    const a = p.sessions.find((s) => s.type === "comparison");
    const b = p.sessions.find((s) => s.type === "shopping");
    const status: ParticipantStatus = p.withdrawnAt ? "withdrawn" : a?.status === "completed" ? "completed" : a?.status === "in_progress" ? "in_progress" : "not_started";
    return {
      id: p.id,
      code: p.code,
      isSimulated: p.isSimulated,
      group: p.group,
      status,
      comparisonId: a?.id ?? null,
      comparisonLink: a ? sessionLink(a.token) : null,
      comparisonLabel: a?.status === "completed" ? "Completed" : a?.status === "in_progress" ? "In progress" : "Not started",
      shoppingId: b?.id ?? null,
      shoppingLink: b ? sessionLink(b.token) : null,
      shoppingUnlocked: !!b?.unlockedAt,
      shoppingStatus: b?.status ?? null,
      attentionFailed: computeQuality(p.trials).attentionFailed,
      withdrawnReason: p.withdrawnReason,
      plansSource: p.plans[0]?.source ?? null,
      plansCount: p.plans.length,
    };
  });
}

export async function activeFrozenModel() {
  return prisma.frozenModel.findFirst({ where: { status: "active" }, orderBy: { version: "desc" } });
}

/** True while the most recent freeze-related action is an unfreeze: re-running is then allowed despite started sessions. */
async function unfreezeInForce(): Promise<boolean> {
  const latest = await prisma.adminAction.findFirst({ where: { action: { in: ["freeze", "unfreeze"] } }, orderBy: { at: "desc" } });
  return latest?.action === "unfreeze";
}

export interface FreezeReadiness {
  included: StatusRow[];
  attentionFailed: StatusRow[];
  withdrawn: StatusRow[];
  unfinished: StatusRow[];
  simulatedIncluded: number;
  shoppingStarted: boolean;
  unfreezeActive: boolean;
  blockers: string[];
  ready: boolean;
}

export async function freezeReadiness(): Promise<FreezeReadiness> {
  const rows = await participantStatus();
  const included = rows.filter((r) => r.status === "completed" && !r.attentionFailed);
  const attentionFailed = rows.filter((r) => r.status === "completed" && r.attentionFailed);
  const withdrawn = rows.filter((r) => r.status === "withdrawn");
  const unfinished = rows.filter((r) => r.status === "in_progress" || r.status === "not_started");
  const shoppingStarted = rows.some((r) => r.shoppingUnlocked);
  const unfreezeActive = await unfreezeInForce();
  const anySimulated = await prisma.participant.count({ where: { isSimulated: true } });
  const blockers: string[] = [];
  if (anySimulated > 0 && !testToolsEnabled()) blockers.push(`${anySimulated} simulated participant(s) are in this database, and test tools are off. Models cannot be frozen with simulated data on a study deployment.`);
  if (shoppingStarted && !unfreezeActive) blockers.push("A shopping session (Session 2) has started, so the models are frozen.");
  if (unfinished.length) blockers.push(`${unfinished.length} participant(s) have not finished Session 1 (comparisons): ${unfinished.map((r) => r.code).join(", ")}. Finish or withdraw them first.`);
  if (included.length === 0) blockers.push("No participant has finished Session 1 (comparisons) and passed the attention checks.");
  return {
    included,
    attentionFailed,
    withdrawn,
    unfinished,
    simulatedIncluded: included.filter((r) => r.isSimulated).length,
    shoppingStarted,
    unfreezeActive,
    blockers,
    ready: blockers.length === 0,
  };
}

async function loadEngineParticipants(rows: readonly StatusRow[]): Promise<EngineParticipant[]> {
  const trials = await prisma.comparisonTrial.findMany({
    where: { sessionId: { in: rows.map((r) => r.comparisonId!) }, isPractice: false, isRepeat: false, isAttentionCheck: false, choice: { not: null } },
    orderBy: [{ sessionId: "asc" }, { seq: "asc" }],
    select: { sessionId: true, leftClipId: true, rightClipId: true, choice: true },
  });
  const bySession = new Map<string, EngineParticipant["trials"]>();
  for (const t of trials) {
    const list = bySession.get(t.sessionId) ?? [];
    list.push({ left: t.leftClipId, right: t.rightClipId, choice: t.choice! });
    bySession.set(t.sessionId, list);
  }
  return rows.map((r) => ({ code: r.code, trials: bySession.get(r.comparisonId!) ?? [] }));
}

/** Informational only: the Latin squares balance exactly when the number of participants is a multiple of 16. */
export function latinWarnings(count: number): string[] {
  return count % LATIN_BALANCE_GROUP === 0 ? [] : [`${count} participants is not a multiple of ${LATIN_BALANCE_GROUP}, so condition and task orders are not exactly balanced. This does not block anything; the analysis models order and position.`];
}

export function hashInput(participants: readonly EngineParticipant[]): string {
  const sorted = [...participants].sort((a, b) => (a.code < b.code ? -1 : 1));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export interface FreezeProgress {
  jobId: string;
  total: number;
  done: number;
  finished: boolean;
  version?: number;
}

/** Starts a new run, replacing any unfinished one. Nothing about plans or models changes until the commit. */
export async function startFreeze(): Promise<FreezeProgress> {
  const readiness = await freezeReadiness();
  if (!readiness.ready) throw new FreezeError(readiness.blockers.join(" "));
  const participants = await loadEngineParticipants([...readiness.included, ...readiness.attentionFailed]);
  await prisma.freezeJob.updateMany({ where: { status: "running" }, data: { status: "cancelled" } });
  const job = await prisma.freezeJob.create({
    data: { inputHash: hashInput(participants), remaining: readiness.included.map((r) => r.code).sort(), results: [] },
  });
  return { jobId: job.id, total: readiness.included.length + 1, done: 0, finished: false };
}

/**
 * Computes for up to budgetMs. Input is reloaded each time and compared with the hash taken at the start, so data that
 * changes half way through stops the run rather than mixing two versions of the data.
 */
export async function stepFreeze(jobId: string, budgetMs: number): Promise<FreezeProgress> {
  const job = await prisma.freezeJob.findUnique({ where: { id: jobId } });
  if (!job) throw new FreezeError("Unknown freeze run");
  if (job.status !== "running") throw new FreezeError(`This freeze run is ${job.status}. Start again.`);
  const readiness = await freezeReadiness();
  if (!readiness.ready) throw new FreezeError(readiness.blockers.join(" "));
  const includedPeople = await loadEngineParticipants(readiness.included);
  const failedPeople = await loadEngineParticipants(readiness.attentionFailed);
  if (hashInput([...includedPeople, ...failedPeople]) !== job.inputHash) {
    await prisma.freezeJob.update({ where: { id: jobId }, data: { status: "failed", error: "The data changed during the run." } });
    throw new FreezeError("The Session 1 data changed during the run. Start again.");
  }
  const started = Date.now();
  const remaining = [...(job.remaining as string[])];
  const results = [...(job.results as unknown as ParticipantModels[])];
  let pool = job.pool as unknown as SharedModels | null;
  if (!pool) pool = computePool(includedPeople);
  while (remaining.length && Date.now() - started < budgetMs) results.push(computeLeaveOneOut(remaining.shift()!, includedPeople));
  const computeMs = job.computeMs + (Date.now() - started);
  await prisma.freezeJob.update({
    where: { id: jobId },
    data: { remaining, results: results as unknown as Prisma.InputJsonValue, pool: pool as unknown as Prisma.InputJsonValue, computeMs },
  });
  const total = readiness.included.length + 1;
  if (remaining.length) return { jobId, total, done: results.length + 1, finished: false };
  const version = await commitFreeze(jobId);
  return { jobId, total, done: total, finished: true, version };
}

function planData(result: Pick<ParticipantModels, "code" | "targets">, participantId: string, condition: Condition, frozenModelId: string) {
  const steps = planFile(result).conditions[condition].steps as unknown as Prisma.InputJsonValue;
  return { participantId, condition, steps, source: "computed", frozenModelId, sourceFileName: null };
}

/** Writes everything in one transaction. `beforeCommit` exists for the test that a failure leaves nothing behind. */
export async function commitFreeze(jobId: string, hooks: { beforeCommit?: () => Promise<void> } = {}): Promise<number> {
  const job = await prisma.freezeJob.findUniqueOrThrow({ where: { id: jobId } });
  const readiness = await freezeReadiness();
  if (!readiness.ready) throw new FreezeError(readiness.blockers.join(" "));
  const pool = job.pool as unknown as SharedModels;
  const models = job.results as unknown as ParticipantModels[];
  const failedPeople = await loadEngineParticipants(readiness.attentionFailed);
  const outside = failedPeople.map((p) => planFromPool(p, pool));
  const rowOf = new Map([...readiness.included, ...readiness.attentionFailed].map((r) => [r.code, r]));
  const uploaded = await prisma.adaptationPlan.findMany({ where: { source: "uploaded", participantId: { in: [...rowOf.values()].map((r) => r.id) } }, select: { participantId: true } });
  const overridden = new Set(uploaded.map((u) => u.participantId));
  const results: FrozenResult[] = [...models, ...outside].map((m) => {
    const row = rowOf.get(m.code)!;
    return { ...m, participantId: row.id, isSimulated: row.isSimulated, attentionFailed: row.attentionFailed, late: false, planSource: overridden.has(row.id) ? "uploaded" : "computed" };
  });
  for (const r of results) {
    const check = validatePlanFile(planFile(r));
    if (!check.ok) throw new FreezeError(`The computed plan for ${r.code} is not valid: ${check.errors.join("; ")}`);
  }
  const excluded: ExcludedEntry[] = [
    ...readiness.withdrawn.map((r) => ({ code: r.code, reason: `withdrawn: ${r.withdrawnReason ?? "no reason given"}` })),
    ...readiness.attentionFailed.map((r) => ({ code: r.code, reason: "failed an attention check: left out of model building, plan built from all included participants" })),
  ];
  const compromised = (await prisma.adminAction.count({ where: { action: "unfreeze" } })) > 0;
  const previous = await prisma.frozenModel.findFirst({ orderBy: { version: "desc" } });
  const version = (previous?.version ?? 0) + 1;
  await prisma.$transaction(
    async (tx) => {
      await tx.frozenModel.updateMany({ where: { status: "active" }, data: { status: "superseded" } });
      const frozen = await tx.frozenModel.create({
        data: {
          version,
          appVersion: process.env.APP_VERSION ?? "unknown",
          inputHash: job.inputHash,
          settings: PLAN_ENGINE as unknown as Prisma.InputJsonValue,
          pool: pool as unknown as Prisma.InputJsonValue,
          results: results as unknown as Prisma.InputJsonValue,
          eligible: readiness.included.map((r) => ({ id: r.id, code: r.code })) as Prisma.InputJsonValue,
          excluded: excluded as unknown as Prisma.InputJsonValue,
          warnings: [...engineWarnings(readiness.included.length, pool), ...latinWarnings(readiness.included.length)] as Prisma.InputJsonValue,
          clusters: clusterReport(pool, models) as unknown as Prisma.InputJsonValue,
          simulatedCount: readiness.simulatedIncluded,
          compromised,
          computeMs: job.computeMs,
        },
      });
      await tx.adaptationPlan.deleteMany({ where: { source: "computed" } });
      const rows = results.filter((r) => r.planSource === "computed").flatMap((r) => CONDITIONS.map((c) => planData(r, r.participantId, c, frozen.id)));
      if (rows.length) await tx.adaptationPlan.createMany({ data: rows });
      await tx.adminAction.create({
        data: {
          action: "freeze",
          details: { version, inputHash: job.inputHash, included: readiness.included.length, excluded: excluded.length, simulated: readiness.simulatedIncluded, computeMs: job.computeMs, compromised },
        },
      });
      await tx.freezeJob.update({ where: { id: jobId }, data: { status: "done" } });
      await hooks.beforeCommit?.();
    },
    { timeout: 60_000, maxWait: 20_000 },
  );
  return version;
}

/** The whole computation in one call, for tests and scripts. The admin panel uses startFreeze and stepFreeze. */
export async function freezeAndGenerate(hooks: { beforeCommit?: () => Promise<void> } = {}): Promise<{ version: number; computeMs: number }> {
  const started = Date.now();
  const { jobId } = await startFreeze();
  const job = await prisma.freezeJob.findUniqueOrThrow({ where: { id: jobId } });
  const readiness = await freezeReadiness();
  const people = await loadEngineParticipants(readiness.included);
  const pool = computePool(people);
  const results = (job.remaining as string[]).map((code) => computeLeaveOneOut(code, people));
  await prisma.freezeJob.update({ where: { id: jobId }, data: { remaining: [], results: results as unknown as Prisma.InputJsonValue, pool: pool as unknown as Prisma.InputJsonValue, computeMs: Date.now() - started } });
  const version = await commitFreeze(jobId, hooks);
  return { version, computeMs: Date.now() - started };
}

/** Breaking the freeze after a shopping session has started compromises the study, so it takes a phrase and a reason. */
export async function unfreeze(phrase: string, reason: string): Promise<void> {
  if (phrase !== ACTIVE_FREEZE_PHRASE) throw new FreezeError(`Type exactly: ${ACTIVE_FREEZE_PHRASE}`);
  if (!reason.trim()) throw new FreezeError("A reason is required.");
  const frozen = await activeFrozenModel();
  await prisma.$transaction([
    prisma.adminAction.create({ data: { action: "unfreeze", reason: reason.trim(), details: { fromVersion: frozen?.version ?? null } } }),
    ...(frozen ? [prisma.frozenModel.update({ where: { id: frozen.id }, data: { compromised: true } })] : []),
  ]);
}

export async function withdrawParticipant(participantId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new FreezeError("A reason is required.");
  const p = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!p) throw new FreezeError("Unknown participant");
  await prisma.$transaction([
    prisma.participant.update({ where: { id: participantId }, data: { withdrawnAt: new Date(), withdrawnReason: reason.trim() } }),
    prisma.adminAction.create({ data: { action: "withdraw", reason: reason.trim(), details: { code: p.code } } }),
  ]);
}

export async function reinstateParticipant(participantId: string): Promise<void> {
  const p = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!p) throw new FreezeError("Unknown participant");
  await prisma.$transaction([
    prisma.participant.update({ where: { id: participantId }, data: { withdrawnAt: null, withdrawnReason: null } }),
    prisma.adminAction.create({ data: { action: "reinstate", details: { code: p.code } } }),
  ]);
}

/** Someone who finished Session 1 after the freeze: a plan from the frozen models, which never saw their data. */
export async function generateLatePlan(participantId: string): Promise<void> {
  const frozen = await activeFrozenModel();
  if (!frozen) throw new FreezeError("There are no frozen models yet.");
  const row = (await participantStatus()).find((r) => r.id === participantId);
  if (!row) throw new FreezeError("Unknown participant");
  if (row.status !== "completed") throw new FreezeError(`${row.code} has not completed Session 1 (comparisons).`);
  const existing = frozen.results as unknown as FrozenResult[];
  if (existing.some((r) => r.code === row.code)) throw new FreezeError(`${row.code} is already in the frozen models.`);
  const [person] = await loadEngineParticipants([row]);
  const models = planFromPool(person!, frozen.pool as unknown as SharedModels);
  const result: FrozenResult = { ...models, participantId: row.id, isSimulated: row.isSimulated, attentionFailed: row.attentionFailed, late: true, planSource: "computed" };
  const check = validatePlanFile(planFile(result));
  if (!check.ok) throw new FreezeError(`The computed plan for ${row.code} is not valid: ${check.errors.join("; ")}`);
  await prisma.$transaction([
    prisma.adaptationPlan.deleteMany({ where: { participantId: row.id } }),
    prisma.adaptationPlan.createMany({ data: CONDITIONS.map((c) => planData(result, row.id, c, frozen.id)) }),
    prisma.frozenModel.update({ where: { id: frozen.id }, data: { results: [...existing, result] as unknown as Prisma.InputJsonValue } }),
    prisma.adminAction.create({ data: { action: "late_plan", details: { code: row.code, version: frozen.version } } }),
  ]);
}
