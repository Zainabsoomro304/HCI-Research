import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createParticipants } from "@/lib/participants";
import { ActionError, applyAction, buildState, getSessionByToken } from "@/lib/session";
import { loadConsent } from "@/lib/session/comparison";
import type { ComparisonState } from "@/lib/session/types";

afterAll(async () => {
  await prisma.$disconnect();
});

const background = {
  age: 34,
  gender: "woman",
  occupation: "employed",
  field: "Nursing",
  csOrIt: "no",
  techConfidence: 5,
  shoppingFrequency: "monthly",
  prefLayout: "grid2",
  prefTextSize: "medium",
  prefDetail: "some",
  prefTheme: "noPreference",
  prefMenu: "side",
};

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

describe("Phase 1 comparison session", () => {
  it("runs consent -> background -> practice -> 82 trials with breaks after 27 and 54 -> end", async () => {
    const [p] = await createParticipants({ studyPhase: 1, count: 1 });
    expect(p!.code).toMatch(/^P1-\d{3}$/);
    const token = p!.sessions[0]!.token;

    let st = (await buildState((await getSessionByToken(token))!)) as ComparisonState;
    expect(st.step).toBe("consent");
    expect(st.consent!.markdown).toContain("PLACEHOLDER");

    await act(token, { type: "start", viewport: { w: 1280, h: 800 }, userAgent: "vitest" });
    st = await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, clientTs: Date.now() });
    expect(st.step).toBe("background");
    // Full schedule stored before trial 1.
    expect(await prisma.comparisonTrial.count({ where: { session: { token } } })).toBe(84);

    st = await act(token, { type: "background", answers: background, clientTs: Date.now() });
    expect(st.step).toBe("instructions");
    expect((await prisma.participant.findUnique({ where: { id: p!.id } }))!.group).toBe("nonCs");

    st = await act(token, { type: "instructions_done" });
    expect(st.step).toBe("practice");
    expect(st.trial!.isPractice).toBe(true);
    expect(st.trial!.leftUrl).toMatch(/^\/m\/[0-9a-f]{16}\.mp4$/);
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
    expect(st.end!.completionCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

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
    const [p] = await createParticipants({ studyPhase: 3, count: 1 });
    const token = p!.sessions.find((s) => s.type === "p3_sessionA")!.token;
    await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, clientTs: Date.now() });
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
    const [p] = await createParticipants({ studyPhase: 1, count: 1 });
    const token = p!.sessions[0]!.token;
    await act(token, { type: "consent", agreed: true, hash: loadConsent("en").hash, clientTs: Date.now() });
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
    const [p] = await createParticipants({ studyPhase: 1, count: 1 });
    const token = p!.sessions[0]!.token;
    await expect(act(token, { type: "instructions_done" })).rejects.toBeInstanceOf(ActionError);
    await expect(act(token, { type: "consent", agreed: false, hash: "x", clientTs: 1 })).rejects.toMatchObject({ status: 400 });
    await expect(act(token, { type: "consent", agreed: true, hash: "0".repeat(64), clientTs: Date.now() })).rejects.toBeInstanceOf(ActionError);
  });
});
