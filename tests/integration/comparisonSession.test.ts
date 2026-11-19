import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createParticipants } from "@/lib/participants";
import { ActionError, applyAction, buildState, getSessionByToken } from "@/lib/session";
import { loadConsent } from "@/lib/session/comparison";
import type { ComparisonState } from "@/lib/session/types";
import { CLIP_SCENES } from "@/config/shop";
import { CONFIRMED, background } from "./fixtures";

afterAll(async () => {
  await prisma.$disconnect();
});


async function act(token: string, body: unknown) {
  const s = (await getSessionByToken(token))!;
  await applyAction(s, body);
  return (await buildState((await getSessionByToken(token))!)) as ComparisonState;
}

async function answerCurrent(token: string, choice: "left" | "right" = "left") {
  const s = (await buildState((await getSessionByToken(token))!)) as ComparisonState;
  const now = Date.now();
  return act(token, { type: "trial", trialId: s.trial!.id, choice, rtMs: 900, replayCount: 0, clientShownAt: now - 5000, clientBothEndedAt: now - 900, clientRespondedAt: now });
}

describe("comparison session (Session 1)", () => {
  it("runs consent -> background -> practice -> 82 trials with breaks after 27 and 54 -> end", async () => {
    const [p] = await createParticipants({ count: 1 });
    expect(p!.code).toMatch(/^P-\d{3}$/);
    expect(p!.sessions.map((x) => x.type).sort()).toEqual(["comparison", "shopping"]);
    const token = p!.sessions.find((s) => s.type === "comparison")!.token;

    let st = (await buildState((await getSessionByToken(token))!)) as ComparisonState;
    expect(st.step).toBe("language");
    await act(token, { type: "start", viewport: { w: 1280, h: 800 }, userAgent: "vitest" });
    st = await act(token, { type: "language", lang: "en" });
    expect(st.step).toBe("consent");
    expect(st.consent!.markdown).not.toMatch(/PLACEHOLDER|\{\{/);
    expect(st.consent!.markdown).toContain("study@example.org");
    st = await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, confirmations: CONFIRMED, clientTs: Date.now() });
    expect(st.step).toBe("background");
    // Full schedule stored before trial 1.
    expect(await prisma.comparisonTrial.count({ where: { session: { token } } })).toBe(84);

    st = await act(token, { type: "background", answers: background, clientTs: Date.now() });
    expect(st.step).toBe("instructions");
    expect((await prisma.participant.findUnique({ where: { id: p!.id } }))!.group).toBe("nonCs");

    st = await act(token, { type: "instructions_done" });
    expect(st.step).toBe("practice");
    expect(st.trial!.isPractice).toBe(true);
    expect(st.trial!.leftUrl).toMatch(/^\/m\/[0-9a-f]{20}\.mp4$/);
    await answerCurrent(token);
    st = await answerCurrent(token);
    expect(st.step).toBe("main_intro");
    st = await act(token, { type: "main_intro_done" });
    expect(st.step).toBe("trials");
    expect(st.trial!.trialIndex).toBe(1);

    const breaks: number[] = [];
    for (let i = 1; i <= 82; i++) {
      st = await answerCurrent(token, i % 2 ? "left" : "right");
      if (st.step === "break") {
        breaks.push(st.breakInfo!.afterTrialIndex);
        st = await act(token, { type: "break_end", clientTs: Date.now() });
      }
    }
    expect(breaks).toEqual([27, 54]);
    expect(st.step).toBe("end");
    expect(st.participantCode).toBe(p!.code);

    const session = await prisma.session.findUnique({ where: { token } });
    expect(session!.status).toBe("completed");
    expect(session!.completedAt).not.toBeNull();
    expect(session!.appVersion).toBeTruthy();
    expect(await prisma.comparisonTrial.count({ where: { session: { token }, choice: null } })).toBe(0);
    const br = await prisma.breakRecord.findMany({ where: { session: { token } } });
    expect(br).toHaveLength(2);
    for (const b of br) expect(b.durationMs).not.toBeNull();
    const t = await prisma.comparisonTrial.findFirst({ where: { session: { token }, isPractice: false } });
    expect(t!.leftNumChangedSettings).toBeGreaterThanOrEqual(2);
    expect(t!.chosenClipId).toBe(t!.choice === "left" ? t!.leftClipId : t!.rightClipId);
  }, 120_000);

  it("is idempotent for retried trial saves and rejects out-of-order trials", async () => {
    const [p] = await createParticipants({ count: 1 });
    const token = p!.sessions.find((s) => s.type === "comparison")!.token;
    await act(token, { type: "language", lang: "en" });
    await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, confirmations: CONFIRMED, clientTs: Date.now() });
    await act(token, { type: "background", answers: { ...background, csOrIt: "yes" }, clientTs: Date.now() });
    let st = await act(token, { type: "instructions_done" });
    const first = st.trial!;
    const save = { type: "trial", trialId: first.id, choice: "right", rtMs: 1200, replayCount: 1, clientShownAt: Date.now() - 6000, clientBothEndedAt: Date.now() - 1200, clientRespondedAt: Date.now() };
    st = await act(token, save);
    const second = st.trial!;
    // Retrying the same save (response lost) does not overwrite or advance.
    st = await act(token, { ...save, choice: "left" });
    expect(st.trial!.id).toBe(second.id);
    expect((await prisma.comparisonTrial.findUnique({ where: { id: first.id } }))!.choice).toBe("right");
    // A trial that is not the current one is rejected.
    const later = await prisma.comparisonTrial.findFirst({ where: { session: { token }, seq: 10 } });
    await expect(act(token, { ...save, trialId: later!.id })).rejects.toBeInstanceOf(ActionError);
    expect((await prisma.participant.findUnique({ where: { id: p!.id } }))!.group).toBe("cs");
  });

  it("resumes at the exact trial after reloading", async () => {
    const [p] = await createParticipants({ count: 1 });
    const token = p!.sessions.find((s) => s.type === "comparison")!.token;
    await act(token, { type: "language", lang: "en" });
    await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, confirmations: CONFIRMED, clientTs: Date.now() });
    await act(token, { type: "background", answers: background, clientTs: Date.now() });
    await act(token, { type: "instructions_done" });
    await answerCurrent(token);
    await answerCurrent(token);
    await act(token, { type: "main_intro_done" });
    for (let i = 0; i < 5; i++) await answerCurrent(token);
    const st = (await buildState((await getSessionByToken(token))!)) as ComparisonState;
    expect(st.step).toBe("trials");
    expect(st.trial!.trialIndex).toBe(6);
    expect(st.progress).toEqual({ done: 5, total: 82 });
  });

  it("rejects actions in the wrong step and invalid payloads", async () => {
    const [p] = await createParticipants({ count: 1 });
    const token = p!.sessions.find((s) => s.type === "comparison")!.token;
    await expect(act(token, { type: "instructions_done" })).rejects.toBeInstanceOf(ActionError);
    await expect(act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, confirmations: CONFIRMED, clientTs: Date.now() })).rejects.toBeInstanceOf(ActionError);
    await expect(act(token, { type: "language", lang: "fr" })).rejects.toMatchObject({ status: 400 });
    await act(token, { type: "language", lang: "en" });
    await expect(act(token, { type: "language", lang: "ur" })).rejects.toBeInstanceOf(ActionError);
    await expect(act(token, { type: "consent", agreed: false, hash: "x", clientTs: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(act(token, { type: "consent", agreed: true, hash: "0".repeat(64), confirmations: CONFIRMED, clientTs: Date.now() })).rejects.toBeInstanceOf(ActionError);
    // All three boxes must be ticked.
    await expect(act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, confirmations: { ...CONFIRMED, ageEligible: false }, clientTs: Date.now() })).rejects.toMatchObject({ status: 400 });
    await expect(act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, clientTs: Date.now() })).rejects.toMatchObject({ status: 400 });
  });

  it("stores the consent with the hash of the exact text shown, including the researchers' details", async () => {
    const [p] = await createParticipants({ count: 1 });
    const token = p!.sessions.find((s) => s.type === "comparison")!.token;
    await act(token, { type: "language", lang: "ur" });
    const shown = loadConsent("ur");
    expect(shown.markdown).toContain("Example University");
    await act(token, { type: "consent", agreed: true, hash: shown.hash, confirmations: CONFIRMED, clientTs: Date.now() });
    const record = await prisma.consentRecord.findFirst({ where: { participantId: p!.id } });
    expect(record!.consentTextHash).toBe(shown.hash);
    expect(record!.language).toBe("ur");
  });

  it("records language and scene on every trial, with both clips of a trial in one scene and language", async () => {
    const [p] = await createParticipants({ count: 1 });
    const token = p!.sessions.find((s) => s.type === "comparison")!.token;
    await act(token, { type: "language", lang: "ur" });
    expect((await prisma.participant.findUnique({ where: { id: p!.id } }))!.language).toBe("ur");
    const st = await act(token, { type: "consent", agreed: true, hash: loadConsent("ur").hash, confirmations: CONFIRMED, clientTs: Date.now() });
    expect(st.step).toBe("background");
    const trials = await prisma.comparisonTrial.findMany({ where: { session: { token } } });
    expect(trials).toHaveLength(84);
    for (const t of trials) {
      expect(t.language).toBe("ur");
      expect(CLIP_SCENES).toContain(t.scene);
    }
    expect((await prisma.session.findUnique({ where: { token } }))!.language).toBe("ur");
  });
});

describe("eligibility screening (age 40+)", () => {
  it("rejects a background under 40, and screen_out ends the session with only a screening record", async () => {
    const [p] = await createParticipants({ count: 1 });
    const token = p!.sessions.find((s) => s.type === "comparison")!.token;
    await act(token, { type: "language", lang: "en" });
    await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, confirmations: CONFIRMED, clientTs: Date.now() });
    await expect(act(token, { type: "background", answers: { ...background, age: 39 }, clientTs: Date.now() })).rejects.toBeInstanceOf(ActionError);
    await expect(act(token, { type: "screen_out", age: 45, clientTs: Date.now() })).rejects.toBeInstanceOf(ActionError);
    const st = await act(token, { type: "screen_out", age: 39, clientTs: Date.now() });
    expect(st.step).toBe("ineligible");
    const participant = await prisma.participant.findUnique({ where: { id: p!.id } });
    expect(participant!.withdrawnAt).not.toBeNull();
    expect(participant!.withdrawnReason).toMatch(/Screened out: age 39/);
    const responses = await prisma.questionnaireResponse.findMany({ where: { participantId: p!.id } });
    expect(responses.map((r) => r.instrument)).toEqual(["screening"]);
    expect(responses[0]!.responses).toEqual({ age: 39, eligible: false });
    expect(await prisma.comparisonTrial.count({ where: { session: { token }, choice: { not: null } } })).toBe(0);
    await expect(act(token, { type: "background", answers: background, clientTs: Date.now() })).rejects.toBeInstanceOf(ActionError);
  });

  it("accepts exactly 40", async () => {
    const [p] = await createParticipants({ count: 1 });
    const token = p!.sessions.find((s) => s.type === "comparison")!.token;
    await act(token, { type: "language", lang: "en" });
    await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, confirmations: CONFIRMED, clientTs: Date.now() });
    const st = await act(token, { type: "background", answers: { ...background, age: 40 }, clientTs: Date.now() });
    expect(st.step).toBe("instructions");
  });
});
