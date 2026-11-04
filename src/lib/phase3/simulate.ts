/**
 * Test tools: simulated participants, for rehearsing the whole study. Refuses to run unless ALLOW_TEST_TOOLS=true, and
 * only ever acts on participants marked isSimulated. Sessions go through the same server code a real session uses.
 */
import type { Prisma } from "@prisma/client";
import { SIMULATION } from "@/config/simulation";
import { productsById } from "../catalog";
import { prisma } from "../db";
import { generateToken, sessionTypesFor } from "../participants";
import { hashSeed } from "../planEngine/engine";
import { BASE_CONFIG_ID, SETTINGS, encode, numChanged, score } from "../planEngine/model";
import { restrictedArgmax } from "../planEngine/agent";
import { loadInstrument } from "../questionnaire/instruments";
import { createRng, type Rng } from "../random";
import { applyAction, buildState, getSessionByToken } from "../session";
import { loadConsent } from "../session/comparison";
import { unlockSessionB } from "../session/sessionB";
import type { SessionBState } from "../session/sessionBTypes";
import type { ComparisonState } from "../session/types";
import { getTask } from "../tasks";
import { FreezeError, testToolsEnabled } from "./freeze";

export interface SimulatedTruth {
  seed: number;
  cluster: number;
  w: number[];
  lapse: number;
  attentionErrorRate: number;
  bestTarget: string;
}

function requireTestTools() {
  if (!testToolsEnabled()) throw new FreezeError("Test tools are off. Set ALLOW_TEST_TOOLS=true on this deployment to use them.");
}

function normal(r: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - r.next())) * Math.cos(2 * Math.PI * r.next());
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export async function createSimulatedParticipants(opts: { count: number; csShare: number; seed: number; attentionErrorRate?: number }) {
  requireTestTools();
  if (opts.count < 1 || opts.count > 200) throw new FreezeError("Choose between 1 and 200 participants.");
  const attentionErrorRate = opts.attentionErrorRate ?? SIMULATION.attentionErrorRate;
  const shared = createRng(hashSeed(`simulate|${opts.seed}`));
  const nCs = Math.round(opts.count * opts.csShare);
  const groups = shared.shuffle([...new Array<"cs">(nCs).fill("cs"), ...new Array<"nonCs">(opts.count - nCs).fill("nonCs")]);
  return prisma.$transaction(async (tx) => {
    const last = await tx.participant.findFirst({ where: { studyPhase: 3 }, orderBy: { number: "desc" } });
    const start = (last?.number ?? 0) + 1;
    const codes: string[] = [];
    for (let i = 0; i < opts.count; i++) {
      const number = start + i;
      const code = `P3-S${String(number).padStart(3, "0")}`;
      const r = createRng(hashSeed(`simulate|${opts.seed}|${number}`));
      const cluster = r.int(0, SIMULATION.clusterMeans.length - 1);
      const decisiveness = Math.exp(SIMULATION.decisivenessLogSd * normal(r));
      const w = SIMULATION.clusterMeans[cluster]!.map((m) => decisiveness * (SIMULATION.weightScale * m + SIMULATION.individualSd * normal(r)));
      const truth: SimulatedTruth = { seed: 1 + r.int(0, 0x7ffffffd), cluster, w, lapse: r.next() * SIMULATION.lapseMax, attentionErrorRate, bestTarget: restrictedArgmax(w, 2, 4) };
      await tx.participant.create({
        data: {
          code,
          studyPhase: 3,
          number,
          seed: truth.seed,
          group: groups[i]!,
          groupSource: "admin",
          isSimulated: true,
          simulatedTruth: truth as unknown as Prisma.InputJsonValue,
          notes: "SIMULATED participant",
          sessions: { create: sessionTypesFor(3).map((type) => ({ type, token: generateToken() })) },
        },
      });
      codes.push(code);
    }
    await tx.adminAction.create({ data: { action: "test_tools", details: { did: "create", count: opts.count, seed: opts.seed, first: codes[0], last: codes.at(-1) } } });
    return codes;
  });
}

async function simulatedParticipant(participantId: string) {
  requireTestTools();
  const p = await prisma.participant.findUnique({ where: { id: participantId }, include: { sessions: true } });
  if (!p) throw new FreezeError("Unknown participant");
  if (!p.isSimulated) throw new FreezeError(`${p.code} is not a simulated participant, so the test tools will not touch it.`);
  return { ...p, truth: p.simulatedTruth as unknown as SimulatedTruth };
}

async function act(token: string, body: unknown) {
  await applyAction((await getSessionByToken(token))!, body);
  return buildState((await getSessionByToken(token))!);
}

function backgroundAnswers(truth: SimulatedTruth, group: string, r: Rng) {
  const labels: Record<string, [string, Record<string, string>]> = {
    layout: ["prefLayout", { list: "list", grid2: "grid2", grid3: "grid3" }],
    fontSize: ["prefTextSize", { default: "medium", small: "small", large: "large" }],
    density: ["prefDetail", { detailed: "lots", partial: "some", summary: "minimal" }],
    theme: ["prefTheme", { light: "light", dark: "dark" }],
    menu: ["prefMenu", { sidebar: "side", dropdown: "dropdown" }],
  };
  const answers: Record<string, string | number> = {
    age: r.int(18, 59),
    gender: r.pick(["woman", "man", "nonBinary", "preferNot"]),
    occupation: r.pick(["student", "employed"]),
    field: "Simulated",
    csOrIt: group === "cs" ? "yes" : "no",
    techConfidence: r.int(3, 7),
    shoppingFrequency: r.pick(["monthly", "weekly"]),
  };
  let start = 0;
  for (const [setting, levels] of Object.entries(SETTINGS)) {
    const size = levels.length - 1;
    const utilities = [0, ...truth.w.slice(start, start + size)];
    start += size;
    const [column, map] = labels[setting]!;
    if (r.next() < SIMULATION.questionnaireNoPreference) answers[column] = "noPreference";
    else if (r.next() < SIMULATION.questionnaireInformativeness) answers[column] = map[levels[utilities.indexOf(Math.max(...utilities))]!]!;
    else answers[column] = map[r.pick(levels)]!;
  }
  return answers;
}

function chooseLeft(truth: SimulatedTruth, left: string, right: string, position: number, r: Rng): boolean {
  const du = score(truth.w, left) - score(truth.w, right);
  const dbusy = numChanged(left) - numChanged(right);
  const p = sigmoid(du + SIMULATION.sideBias + SIMULATION.busyGamma * dbusy);
  const lapse = Math.min(1, truth.lapse + SIMULATION.fatigueLapseSlope * position);
  return r.next() < (1 - lapse) * p + lapse / 2;
}

/** A complete Session A: consent, background questionnaire, the stored schedule and every response. Safe to re-run. */
export async function simulateSessionA(participantId: string): Promise<void> {
  const p = await simulatedParticipant(participantId);
  const session = p.sessions.find((s) => s.type === "p3_sessionA")!;
  if (session.status === "completed") return;
  const token = session.token;
  const r = createRng(hashSeed(`sessionA|${p.truth.seed}`));
  await act(token, { type: "start", viewport: { w: 1440, h: 900 }, userAgent: "simulated" });
  await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, clientTs: Date.now() });
  await act(token, { type: "background", answers: backgroundAnswers(p.truth, p.group, r), clientTs: Date.now() });
  let state = (await act(token, { type: "instructions_done" })) as ComparisonState;
  const trials = await prisma.comparisonTrial.findMany({ where: { sessionId: session.id } });
  const byId = new Map(trials.map((t) => [t.id, t]));
  const total = trials.filter((t) => !t.isPractice).length;
  let clock = Date.now() - 45 * 60_000;
  while (state.step !== "end") {
    if (state.step === "main_intro") state = (await act(token, { type: "main_intro_done" })) as ComparisonState;
    else if (state.step === "break") state = (await act(token, { type: "break_end", clientTs: Date.now() })) as ComparisonState;
    else {
      const trial = byId.get(state.trial!.id)!;
      const position = trial.isPractice ? 0 : trial.trialIndex / total;
      const choice = trial.isAttentionCheck ? (r.next() < p.truth.attentionErrorRate ? "left" : "right") : chooseLeft(p.truth, trial.leftClipId, trial.rightClipId, position, r) ? "left" : "right";
      const rt = Math.max(150, Math.round(SIMULATION.rtMedianMs * Math.exp(SIMULATION.rtLogSd * normal(r))));
      const shown = clock;
      const ended = shown + 4200;
      clock = ended + rt + 300;
      state = (await act(token, { type: "trial", trialId: trial.id, choice, rtMs: rt, replayCount: r.next() < 0.05 ? 1 : 0, clientShownAt: shown, clientBothEndedAt: ended, clientRespondedAt: ended + rt })) as ComparisonState;
    }
  }
}

function itemAnswers(instrument: "quis" | "ues_sf", latent: number, r: Rng) {
  const fraction = Math.min(1, Math.max(0, latent / 9));
  return Object.fromEntries(
    loadInstrument(instrument).items.map((item) => {
      if (item.allowNA && r.next() < SIMULATION.sessionB.naRate) return [item.id, "NA"];
      const { min, points } = item.scale;
      const raw = Math.round(min + fraction * (points - 1) + SIMULATION.sessionB.itemNoiseSd * normal(r));
      const value = Math.min(min + points - 1, Math.max(min, raw));
      return [item.id, item.reverse ? 2 * min + points - 1 - value : value];
    }),
  );
}

/** Task results, questionnaires and the ranking, following the participant's stored plan. Needs a plan and Session A. */
export async function simulateSessionB(participantId: string): Promise<void> {
  const p = await simulatedParticipant(participantId);
  const session = p.sessions.find((s) => s.type === "p3_sessionB")!;
  if (session.status === "completed") return;
  const sb = SIMULATION.sessionB;
  const token = session.token;
  const r = createRng(hashSeed(`sessionB|${p.truth.seed}`));
  await unlockSessionB(session.id);
  await act(token, { type: "start", viewport: { w: 1920, h: 1080 }, userAgent: "simulated" });
  await act(token, { type: "welcome_done" });
  await act(token, { type: "task_finish", blockIndex: -1, cart: [{ productId: "fs-06", quantity: 1 }], firstInteractionAt: Date.now() - 60_000, finalConfigId: BASE_CONFIG_ID, appliedConfigs: [], clientTs: Date.now() });
  const blocks = await prisma.taskBlock.findMany({ where: { sessionId: session.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
  const personEffect = sb.participantSd * normal(r);
  const latents: { blockIndex: number; quis: number }[] = [];
  for (const b of blocks) {
    await act(token, { type: "block_intro_done", blockIndex: b.blockIndex });
    const state = (await buildState((await getSessionByToken(token))!)) as SessionBState;
    const steps = state.block!.steps;
    const target = steps.at(-1)?.config ?? BASE_CONFIG_ID;
    const quis = sb.quisMean + sb.quisPerUtility * encode(target).reduce((a, x, j) => a + x * p.truth.w[j]!, 0) + personEffect + sb.positionEffect * b.blockIndex + sb.residualSd * normal(r);
    latents.push({ blockIndex: b.blockIndex, quis });
    const task = getTask(b.taskId);
    const success = r.next() < sigmoid(sb.successLogit + sb.successPerQuis * (quis - sb.quisMean));
    const dropped = success ? 0 : r.int(1, 3);
    // The cheapest match for each item keeps the basket within budget, so success depends on the items found.
    const cheapest = (ids: readonly string[]) => [...ids].sort((a, b) => productsById.get(a)!.price - productsById.get(b)!.price)[0]!;
    const cart = task.requiredItems.slice(dropped).map((item) => ({ productId: cheapest(item.candidateProductIds), quantity: 1 }));
    const durationMs = 1000 * sb.timeMedianS * Math.exp(sb.timePerQuis * (quis - sb.quisMean) + sb.timeLogSd * normal(r));
    const now = Date.now();
    await act(token, {
      type: "task_finish",
      blockIndex: b.blockIndex,
      cart,
      firstInteractionAt: now - Math.round(durationMs),
      finalConfigId: target,
      appliedConfigs: steps.map((step, i) => ({ step: i + 1, configId: step.config, atMs: step.trigger.value + r.int(0, 60) })),
      clientTs: now,
    });
    await act(token, { type: "questionnaire", blockIndex: b.blockIndex, instrument: "quis", responses: itemAnswers("quis", quis, r) });
    await act(token, { type: "questionnaire", blockIndex: b.blockIndex, instrument: "ues_sf", responses: itemAnswers("ues_sf", quis, r) });
  }
  const ordered = latents.map((l) => ({ ...l, noisy: l.quis + sb.rankNoiseSd * normal(r) })).sort((x, y) => y.noisy - x.noisy);
  await act(token, { type: "ranking", ranks: ordered.map((l, i) => ({ blockIndex: l.blockIndex, rank: i + 1, reason: "" })) });
}
