/**
 * pnpm db:seed:demo — fills the database with fake participants so the admin panel and exports can be tried.
 * Everything goes through the real session engines, so the data has exactly the shape of real data.
 * Demo participants have notes starting with "DEMO". Refuses to run if non-demo participants exist (use --force).
 *
 *   Phase 1: 6 completed (one fails an attention check), 1 in progress, 1 not started
 *   Phase 3: 2 with Session B completed, 1 in Session B, 1 ready for Session B, 1 in Session A
 */
import { CONDITIONS } from "@/config/study";
import { DEFAULT_CONFIG_ID, SETTING_KEYS, SETTING_LEVELS, fromConfigId, toConfigId, type UIConfig } from "@/config/uiSpace";
import { prisma } from "@/lib/db";
import { createParticipants } from "@/lib/participants";
import { savePlanFile } from "@/lib/planStore";
import { itemScale, loadInstrument } from "@/lib/questionnaire/instruments";
import { createRng, type Rng } from "@/lib/random";
import { applyAction, buildState, getSessionByToken } from "@/lib/session";
import { loadConsent } from "@/lib/session/comparison";
import { unlockShopping } from "@/lib/session/shopping";
import type { ShoppingState } from "@/lib/session/shoppingTypes";
import { CONSENT_CONFIRMATIONS, type ComparisonState } from "@/lib/session/types";
import { PREF_ITEMS } from "@/lib/questionnaire/background";
import { getTask } from "@/lib/tasks";

const rng = createRng(20261025);

async function act(token: string, body: unknown) {
  await applyAction((await getSessionByToken(token))!, body);
  return buildState((await getSessionByToken(token))!);
}

function background(r: Rng) {
  const pick = (k: (typeof SETTING_KEYS)[number]) => r.pick([...SETTING_LEVELS[k], "noPreference"]);
  return {
    age: r.int(40, 78),
    gender: r.pick(["woman", "man", "preferNot"]),
    occupation: r.pick(["employed", "selfEmployed", "homemaker", "retired"]),
    csOrIt: r.next() < 0.2 ? "yes" : "no",
    techConfidence: r.int(2, 7),
    smartphoneUse: r.pick(["weekly", "daily"]),
    computerUse: r.pick(["never", "monthly", "weekly", "daily"]),
    shoppingFrequency: r.pick(["never", "lessThanMonthly", "monthly", "weekly"]),
    groceriesOnline: r.pick(["yes", "no"]),
    readingGlasses: r.pick(["yes", "no", "sometimes"]),
    readingLanguage: r.pick(["urdu", "english", "both"]),
    ...Object.fromEntries(SETTING_KEYS.map((k) => [PREF_ITEMS[k], pick(k)])),
  };
}

/** A simulated participant: additive utility per setting level + logistic choice noise. */
function makeChooser(r: Rng) {
  const w = new Map<string, number>();
  for (const k of SETTING_KEYS) for (const l of SETTING_LEVELS[k]) w.set(`${k}:${l}`, (r.next() - 0.5) * 2.4);
  const u = (c: UIConfig) => SETTING_KEYS.reduce((a, k) => a + w.get(`${k}:${c[k]}`)!, 0);
  return (leftId: string, rightId: string): "left" | "right" => {
    const d = u(fromConfigId(rightId)) - u(fromConfigId(leftId));
    return r.next() < 1 / (1 + Math.exp(-d)) ? "right" : "left";
  };
}

/** Runs a comparison session; stops after `stopAfter` analysis trials if given. */
async function runComparison(token: string, r: Rng, opts: { stopAfter?: number; failAttention?: boolean; lang?: "en" | "ur" } = {}) {
  const choose = makeChooser(r);
  await act(token, { type: "start", viewport: { w: 1440, h: 900 }, userAgent: "demo-seed" });
  await act(token, { type: "language", lang: opts.lang ?? "en" });
  await act(token, { type: "consent", agreed: true, hash: loadConsent(opts.lang ?? "en").hash, confirmations: CONFIRMED, clientTs: Date.now() });
  await act(token, { type: "background", answers: background(r), clientTs: Date.now() });
  let st = (await act(token, { type: "instructions_done" })) as ComparisonState;
  const s = (await getSessionByToken(token))!;
  let t = Date.now() - 45 * 60_000;
  let answered = 0;
  let failedOnce = false;
  while (st.step !== "end") {
    if (st.step === "main_intro") st = (await act(token, { type: "main_intro_done" })) as ComparisonState;
    else if (st.step === "break") st = (await act(token, { type: "break_end", clientTs: Date.now() })) as ComparisonState;
    else {
      if (opts.stopAfter !== undefined && !st.trial!.isPractice && answered >= opts.stopAfter) return;
      const trial = await prisma.comparisonTrial.findUniqueOrThrow({ where: { id: st.trial!.id } });
      let choice = trial.isAttentionCheck ? "right" : choose(trial.leftClipId, trial.rightClipId);
      if (trial.isAttentionCheck && opts.failAttention && !failedOnce) (choice = "left"), (failedOnce = true);
      const rt = Math.round(600 + r.next() * 2400);
      const replays = r.next() < 0.1 ? 1 : 0;
      const shown = t;
      const ended = shown + 4000 * (1 + replays) + 200;
      t = ended + rt + 300;
      await prisma.event.createMany({
        data: [
          { clientEventId: `demo-${trial.id}-shown`, participantId: s.participantId, sessionId: s.id, trialId: trial.id, type: "trial_shown", clientTs: new Date(shown), clientTsMs: BigInt(shown), payload: { trialIndex: trial.trialIndex }, isPractice: trial.isPractice },
          { clientEventId: `demo-${trial.id}-ended`, participantId: s.participantId, sessionId: s.id, trialId: trial.id, type: "clip_ended", clientTs: new Date(ended), clientTsMs: BigInt(ended), payload: { side: "right" }, isPractice: trial.isPractice },
        ],
        skipDuplicates: true,
      });
      st = (await act(token, { type: "trial", trialId: trial.id, choice, rtMs: rt, replayCount: replays, clientShownAt: shown, clientBothEndedAt: ended, clientRespondedAt: ended + rt })) as ComparisonState;
      if (!trial.isPractice) answered++;
    }
  }
}

function demoPlan(code: string, r: Rng) {
  const cfg = () => toConfigId(Object.fromEntries(SETTING_KEYS.map((k) => [k, r.pick(SETTING_LEVELS[k])])) as UIConfig);
  const step = (config: string) => ({ steps: [{ trigger: { type: "afterMs", value: 8000 }, config }] });
  return { participantCode: code, conditions: { static: { steps: [] }, global: step(cfg()), cluster5: step(cfg()), personalFull: step(cfg()) } };
}

const CONFIRMED = Object.fromEntries(CONSENT_CONFIRMATIONS.map((k) => [k, true]));

/** Runs the shopping session up to (and excluding) block `stopAtBlock` if given. */
async function runShopping(sessionId: string, token: string, lang: string, r: Rng, stopAtBlock?: number) {
  await unlockShopping(sessionId);
  await act(token, { type: "start", viewport: { w: 1920, h: 1080 }, userAgent: "demo-seed" });
  await act(token, { type: "consent", agreed: true, hash: loadConsent(lang).hash, confirmations: CONFIRMED, clientTs: Date.now() });
  await act(token, { type: "welcome_done" });
  await act(token, { type: "task_finish", blockIndex: -1, cart: [{ productId: "fv-01", quantity: 1 }], firstInteractionAt: Date.now() - 60_000, finalConfigId: DEFAULT_CONFIG_ID, appliedConfigs: [], clientTs: Date.now() });
  const blocks = await prisma.taskBlock.findMany({ where: { sessionId, isPractice: false }, orderBy: { blockIndex: "asc" } });
  const answers = (i: "seq" | "sus") => {
    const file = loadInstrument(i);
    return Object.fromEntries(file.items.map((it) => [it.id, itemScale(file, it).min + r.int(0, itemScale(file, it).points - 1)]));
  };
  for (const b of blocks) {
    if (stopAtBlock !== undefined && b.blockIndex === stopAtBlock) {
      await act(token, { type: "block_intro_done", blockIndex: b.blockIndex });
      return;
    }
    await act(token, { type: "block_intro_done", blockIndex: b.blockIndex });
    const st = (await buildState((await getSessionByToken(token))!)) as ShoppingState;
    const task = getTask(b.taskId);
    const cart = task.requiredItems.filter(() => r.next() < 0.9).map((i) => ({ productId: r.pick(i.candidateProductIds), quantity: 1 }));
    const steps = st.block!.steps;
    await act(token, {
      type: "task_finish",
      blockIndex: b.blockIndex,
      cart,
      firstInteractionAt: Date.now() - r.int(90, 300) * 1000,
      finalConfigId: steps.at(-1)?.config ?? DEFAULT_CONFIG_ID,
      appliedConfigs: steps.map((s, i) => ({ step: i + 1, configId: s.config, atMs: 8000 + i * 20000 })),
      clientTs: Date.now(),
    });
    await act(token, { type: "questionnaire", blockIndex: b.blockIndex, instrument: "seq", responses: answers("seq") });
    await act(token, { type: "questionnaire", blockIndex: b.blockIndex, instrument: "sus", responses: answers("sus") });
  }
  const order = r.shuffle([0, 1, 2, 3]);
  await act(token, { type: "ranking", ranks: order.map((blockIndex, i) => ({ blockIndex, rank: i + 1, reason: i === 0 ? r.pick(["Easy to read", "Felt calm", "Found things quickly"]) : "" })) });
}

async function main() {
  // Participants without notes count as real (SQL NOT LIKE would skip NULLs).
  const real = await prisma.participant.count({ where: { OR: [{ notes: null }, { NOT: { notes: { startsWith: "DEMO" } } }] } });
  if (real > 0 && !process.argv.includes("--force")) {
    console.error(`Refusing: the database already has ${real} non-demo participant(s). Use a development database, or pass --force.`);
    process.exit(1);
  }
  const people = await createParticipants({ count: 9, notes: "DEMO participant" });
  for (const [i, p] of people.entries()) {
    const a = p.sessions.find((s) => s.type === "comparison")!;
    const b = p.sessions.find((s) => s.type === "shopping")!;
    const lang = i % 2 ? "ur" : "en";
    if (i === 6 || i === 8) {
      await runComparison(a.token, rng, { stopAfter: i === 6 ? 42 : 12 });
      console.log(`  ${p.code} Session 1 in progress`);
      continue;
    }
    if (i === 7) {
      console.log(`  ${p.code} not started`);
      continue;
    }
    await runComparison(a.token, rng, { failAttention: i === 5, lang });
    if (i === 5) {
      console.log(`  ${p.code} Session 1 complete (failed attention checks)`);
      continue;
    }
    await savePlanFile(p.id, demoPlan(p.code, rng), "demo-plan.json");
    if (i <= 1) await runShopping(b.id, b.token, lang, rng);
    else if (i === 2) await runShopping(b.id, b.token, lang, rng, 2);
    console.log(`  ${p.code} ${i <= 1 ? "Session 2 complete" : i === 2 ? "in Session 2 (task 3)" : "Session 1 complete, ready for Session 2"}`);
  }
  console.log(`Done. Conditions: ${CONDITIONS.join(", ")}. Open /admin to explore.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
