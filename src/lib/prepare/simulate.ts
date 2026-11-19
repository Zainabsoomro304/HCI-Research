/**
 * Test tools: simulated participants, for rehearsing the whole study. Refuses to run unless ALLOW_TEST_TOOLS=true, and
 * only ever acts on participants marked isSimulated. Sessions go through the same server code a real session uses.
 */
import type { Prisma } from "@prisma/client";
import { SIMULATION } from "@/config/simulation";
import { productsById } from "../catalog";
import { prisma } from "../db";
import { SESSION_TYPES, generateToken, participantCode } from "../participants";
import { hashSeed } from "../planEngine/engine";
import { BASE_CONFIG_ID, SETTINGS, encode, numChanged, score } from "../planEngine/model";
import { restrictedArgmax } from "../planEngine/agent";
import { PREF_ITEMS } from "../questionnaire/background";
import { itemScale, loadInstrument } from "../questionnaire/instruments";
import { createRng, type Rng } from "../random";
import { applyAction, buildState, getSessionByToken } from "../session";
import { loadConsent } from "../session/comparison";
import { unlockShopping } from "../session/shopping";
import type { ShoppingState } from "../session/shoppingTypes";
import { CONSENT_CONFIRMATIONS, type ComparisonState } from "../session/types";
import { getTask } from "../tasks";
import { FreezeError, testToolsEnabled } from "./freeze";

export interface SimulatedTruth {
  seed: number;
  lang: "en" | "ur";
  age: number;
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

export async function createSimulatedParticipants(opts: { count: number; urduShare?: number; seed: number; attentionErrorRate?: number }) {
  requireTestTools();
  if (opts.count < 1 || opts.count > 200) throw new FreezeError("Choose between 1 and 200 participants.");
  const attentionErrorRate = opts.attentionErrorRate ?? SIMULATION.attentionErrorRate;
  const shared = createRng(hashSeed(`simulate|${opts.seed}`));
  const nUr = Math.round(opts.count * (opts.urduShare ?? SIMULATION.urduShare));
  const langs = shared.shuffle([...new Array<"ur">(nUr).fill("ur"), ...new Array<"en">(opts.count - nUr).fill("en")]);
  return prisma.$transaction(async (tx) => {
    const last = await tx.participant.findFirst({ where: { isSimulated: true }, orderBy: { number: "desc" } });
    const start = (last?.number ?? 0) + 1;
    const codes: string[] = [];
    for (let i = 0; i < opts.count; i++) {
      const number = start + i;
      const code = participantCode(number, true);
      const r = createRng(hashSeed(`simulate|${opts.seed}|${number}`));
      const cluster = r.int(0, SIMULATION.clusterMeans.length - 1);
      const decisiveness = Math.exp(SIMULATION.decisivenessLogSd * normal(r));
      const w = SIMULATION.clusterMeans[cluster]!.map((m) => decisiveness * (SIMULATION.weightScale * m + SIMULATION.individualSd * normal(r)));
      const truth: SimulatedTruth = {
        seed: 1 + r.int(0, 0x7ffffffd),
        lang: langs[i]!,
        age: r.int(SIMULATION.ageMin, SIMULATION.ageMax),
        cluster,
        w,
        lapse: r.next() * SIMULATION.lapseMax,
        attentionErrorRate,
        bestTarget: restrictedArgmax(w, 2, 4),
      };
      await tx.participant.create({
        data: {
          code,
          number,
          seed: truth.seed,
          language: truth.lang,
          isSimulated: true,
          simulatedTruth: truth as unknown as Prisma.InputJsonValue,
          notes: "SIMULATED participant",
          sessions: { create: SESSION_TYPES.map((type) => ({ type, token: generateToken() })) },
        },
      });
      codes.push(code);
    }
    await tx.adminAction.create({ data: { action: "test_tools", details: { did: "create", count: opts.count, urdu: nUr, seed: opts.seed, first: codes[0], last: codes.at(-1) } } });
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

function backgroundAnswers(truth: SimulatedTruth, r: Rng) {
  const answers: Record<string, string | number> = {
    age: truth.age,
    gender: r.pick(["woman", "man", "preferNot"]),
    occupation: r.pick(["employed", "selfEmployed", "homemaker", "retired"]),
    csOrIt: r.next() < 0.15 ? "yes" : "no",
    techConfidence: r.int(2, 7),
    smartphoneUse: r.pick(["weekly", "daily", "daily"]),
    computerUse: r.pick(["never", "monthly", "weekly", "daily"]),
    shoppingFrequency: r.pick(["never", "lessThanMonthly", "monthly", "weekly"]),
    groceriesOnline: r.next() < 0.35 ? "yes" : "no",
    readingGlasses: r.pick(["yes", "no", "sometimes"]),
    readingLanguage: truth.lang === "ur" ? r.pick(["urdu", "urdu", "both"]) : r.pick(["english", "both"]),
  };
  // Self-rated preferences follow the true best level with probability questionnaireInformativeness.
  let start = 0;
  for (const [setting, levels] of Object.entries(SETTINGS)) {
    const size = levels.length - 1;
    const utilities = [0, ...truth.w.slice(start, start + size)];
    start += size;
    const column = PREF_ITEMS[setting as keyof typeof PREF_ITEMS];
    if (r.next() < SIMULATION.questionnaireNoPreference) answers[column] = "noPreference";
    else if (r.next() < SIMULATION.questionnaireInformativeness) answers[column] = levels[utilities.indexOf(Math.max(...utilities))]!;
    else answers[column] = r.pick(levels);
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

/** A complete comparison session (Session 1): consent, background questionnaire, the stored schedule and every response. Safe to re-run. */
export async function simulateComparison(participantId: string): Promise<void> {
  const p = await simulatedParticipant(participantId);
  const session = p.sessions.find((s) => s.type === "comparison")!;
  if (session.status === "completed") return;
  const token = session.token;
  const r = createRng(hashSeed(`comparison|${p.truth.seed}`));
  await act(token, { type: "start", viewport: { w: 1440, h: 900 }, userAgent: "simulated" });
  if (session.currentStep === "language") await act(token, { type: "language", lang: p.truth.lang ?? p.language });
  await act(token, { type: "consent", agreed: true, hash: loadConsent(p.truth.lang ?? p.language).hash, confirmations: CONFIRMED, clientTs: Date.now() });
  await act(token, { type: "background", answers: backgroundAnswers(p.truth, r), clientTs: Date.now() });
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

const CONFIRMED = Object.fromEntries(CONSENT_CONFIRMATIONS.map((k) => [k, true]));

/** Answers that follow a latent score on 0-100: agreement for positively worded items, disagreement for reversed ones. */
function itemAnswers(instrument: "seq" | "sus", latent: number, noiseSd: number, r: Rng) {
  const fraction = Math.min(1, Math.max(0, latent / 100));
  const file = loadInstrument(instrument);
  return Object.fromEntries(
    file.items.map((item) => {
      const { min, points } = itemScale(file, item);
      const position = item.reverse ? 1 - fraction : fraction;
      const raw = Math.round(min + position * (points - 1) + noiseSd * normal(r));
      return [item.id, Math.min(min + points - 1, Math.max(min, raw))];
    }),
  );
}

/** Task results, questionnaires and the ranking, following the participant's stored plan. Needs a plan and Session 1. */
export async function simulateShopping(participantId: string): Promise<void> {
  const p = await simulatedParticipant(participantId);
  const session = p.sessions.find((s) => s.type === "shopping")!;
  if (session.status === "completed") return;
  const sb = SIMULATION.shopping;
  const token = session.token;
  const r = createRng(hashSeed(`shopping|${p.truth.seed}`));
  await unlockShopping(session.id);
  await act(token, { type: "start", viewport: { w: 1920, h: 1080 }, userAgent: "simulated" });
  await act(token, { type: "consent", agreed: true, hash: loadConsent(p.language).hash, confirmations: CONFIRMED, clientTs: Date.now() });
  await act(token, { type: "welcome_done" });
  await act(token, { type: "task_finish", blockIndex: -1, cart: [{ productId: "fv-01", quantity: 1 }], firstInteractionAt: Date.now() - 60_000, finalConfigId: BASE_CONFIG_ID, appliedConfigs: [], clientTs: Date.now() });
  const blocks = await prisma.taskBlock.findMany({ where: { sessionId: session.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
  const personEffect = sb.participantSd * normal(r);
  const latents: { blockIndex: number; sus: number }[] = [];
  for (const b of blocks) {
    await act(token, { type: "block_intro_done", blockIndex: b.blockIndex });
    const state = (await buildState((await getSessionByToken(token))!)) as ShoppingState;
    const steps = state.block!.steps;
    const target = steps.at(-1)?.config ?? BASE_CONFIG_ID;
    const sus = sb.susMean + sb.susPerUtility * encode(target).reduce((a, x, j) => a + x * p.truth.w[j]!, 0) + personEffect + sb.positionEffect * b.blockIndex + sb.residualSd * normal(r);
    latents.push({ blockIndex: b.blockIndex, sus });
    const task = getTask(b.taskId);
    const success = r.next() < sigmoid(sb.successLogit + sb.successPerSus * (sus - sb.susMean));
    const dropped = success ? 0 : r.int(1, 3);
    // The cheapest match for each item keeps the basket within budget, so success depends on the items found.
    const cheapest = (ids: readonly string[]) => [...ids].sort((a, b) => productsById.get(a)!.price - productsById.get(b)!.price)[0]!;
    const cart = task.requiredItems.slice(dropped).map((item) => ({ productId: cheapest(item.candidateProductIds), quantity: 1 }));
    const durationMs = 1000 * sb.timeMedianS * Math.exp(sb.timePerSus * (sus - sb.susMean) + sb.timeLogSd * normal(r));
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
    await act(token, { type: "questionnaire", blockIndex: b.blockIndex, instrument: "seq", responses: itemAnswers("seq", sus, sb.seqNoiseSd, r) });
    await act(token, { type: "questionnaire", blockIndex: b.blockIndex, instrument: "sus", responses: itemAnswers("sus", sus, sb.itemNoiseSd, r) });
  }
  const ordered = latents.map((l) => ({ ...l, noisy: l.sus + sb.rankNoiseSd * normal(r) })).sort((x, y) => y.noisy - x.noisy);
  await act(token, { type: "ranking", ranks: ordered.map((l, i) => ({ blockIndex: l.blockIndex, rank: i + 1, reason: "" })) });
}
