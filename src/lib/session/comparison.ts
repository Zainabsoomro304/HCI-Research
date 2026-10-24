/**
 * Server-side state machine for comparison sessions (Phase 1 and Phase 3 Session A).
 * All progress lives in the database, so reloading the link resumes exactly where the participant stopped.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Participant, Prisma, Session } from "@prisma/client";
import rawClips from "@data/clips.json";
import { COMPARISON_DESIGN, totalAnalysisTrials, type StudyPhase } from "@/config/study";
import { fromConfigId, numChangedSettings } from "@/config/uiSpace";
import { parseClipsFile } from "../clipsFile";
import { prisma } from "../db";
import { clipUrl } from "../media";
import { generateCompletionCode } from "../participants";
import { generateSchedule } from "../schedule";
import type { ComparisonAction, ComparisonState, ComparisonStep, TrialView } from "./types";

export class ActionError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
  }
}

type SessionWithParticipant = Session & { participant: Participant };

const clipsFile = parseClipsFile(rawClips);

export function designFor(p: Participant) {
  return COMPARISON_DESIGN[p.studyPhase as StudyPhase] ?? COMPARISON_DESIGN[1];
}

export function loadConsent(lang: string): { markdown: string; hash: string } {
  const dir = path.resolve(process.cwd(), "content");
  const file = fs.existsSync(path.join(dir, `consent.${lang}.md`)) ? `consent.${lang}.md` : "consent.en.md";
  const markdown = fs.readFileSync(path.join(dir, file), "utf8");
  return { markdown, hash: createHash("sha256").update(markdown).digest("hex") };
}

/** Generates and stores the complete trial schedule (idempotent). */
export async function ensureSchedule(tx: Prisma.TransactionClient, s: SessionWithParticipant) {
  if ((await tx.comparisonTrial.count({ where: { sessionId: s.id } })) > 0) return;
  const schedule = generateSchedule({
    clips: clipsFile.clips.map((c) => c.id),
    practiceClips: clipsFile.practiceClips.map((c) => c.id),
    design: designFor(s.participant),
    seed: s.participant.seed,
  });
  const ids = new Map<number, string>();
  // Insert originals before repeats so repeatOfTrialId can reference them.
  for (const t of schedule) {
    const row = await tx.comparisonTrial.create({
      data: {
        participantId: s.participantId,
        sessionId: s.id,
        seq: t.seq,
        trialIndex: t.trialIndex,
        isPractice: t.isPractice,
        isRepeat: t.isRepeat,
        repeatOfTrialId: t.repeatOfSeq === null ? null : ids.get(t.repeatOfSeq)!,
        isAttentionCheck: t.isAttentionCheck,
        leftClipId: t.left,
        rightClipId: t.right,
        leftNumChangedSettings: numChangedSettings(fromConfigId(t.left)),
        rightNumChangedSettings: numChangedSettings(fromConfigId(t.right)),
      },
      select: { id: true },
    });
    ids.set(t.seq, row.id);
  }
}

async function trialView(s: SessionWithParticipant, seq: number): Promise<TrialView | undefined> {
  const [trial, next] = await Promise.all([
    prisma.comparisonTrial.findUnique({ where: { sessionId_seq: { sessionId: s.id, seq } } }),
    prisma.comparisonTrial.findUnique({ where: { sessionId_seq: { sessionId: s.id, seq: seq + 1 } } }),
  ]);
  if (!trial) return undefined;
  const d = designFor(s.participant);
  return {
    id: trial.id,
    trialIndex: trial.trialIndex,
    total: trial.isPractice ? d.practiceTrials : totalAnalysisTrials(d),
    isPractice: trial.isPractice,
    question: trial.isAttentionCheck ? "chooseB" : "normal",
    leftUrl: clipUrl(trial.leftClipId),
    rightUrl: clipUrl(trial.rightClipId),
    preloadUrls: next ? [...new Set([clipUrl(next.leftClipId), clipUrl(next.rightClipId)])] : [],
  };
}

export async function buildComparisonState(s: SessionWithParticipant): Promise<ComparisonState> {
  const step = s.currentStep as ComparisonStep;
  const d = designFor(s.participant);
  const state: ComparisonState = {
    kind: "comparison",
    sessionType: s.type === "phase1" ? "phase1" : "p3_sessionA",
    step,
    lang: s.participant.language,
  };
  const N = totalAnalysisTrials(d);
  if (step === "consent") state.consent = loadConsent(s.participant.language);
  if (step === "practice" || step === "trials") state.trial = await trialView(s, s.currentIndex);
  if (step === "trials" || step === "break" || step === "main_intro")
    state.progress = { done: Math.max(0, s.currentIndex - d.practiceTrials), total: N };
  if (step === "break") state.breakInfo = { afterTrialIndex: s.currentIndex - d.practiceTrials, total: N };
  if (step === "end")
    state.end = { completionCode: s.type === "phase1" ? s.participant.completionCode : null, variant: s.type === "phase1" ? "phase1" : "sessionA" };
  return state;
}

function expectStep(s: Session, ...steps: ComparisonStep[]) {
  if (!steps.includes(s.currentStep as ComparisonStep)) throw new ActionError(`Action not allowed in step "${s.currentStep}"`);
}

export async function applyComparisonAction(s: SessionWithParticipant, action: ComparisonAction): Promise<void> {
  const d = designFor(s.participant);
  const N = totalAnalysisTrials(d);
  const now = new Date();
  switch (action.type) {
    case "start": {
      await prisma.session.update({
        where: { id: s.id },
        data: {
          startedAt: s.startedAt ?? now,
          status: s.status === "completed" ? "completed" : "in_progress",
          appVersion: s.appVersion ?? process.env.APP_VERSION ?? "unknown",
          userAgent: action.userAgent,
          viewportW: action.viewport.w,
          viewportH: action.viewport.h,
          lastSeenAt: now,
        },
      });
      return;
    }
    case "consent": {
      expectStep(s, "consent");
      const { hash } = loadConsent(s.participant.language);
      if (action.hash !== hash) throw new ActionError("Consent text has changed; please reload the page.");
      await prisma.$transaction(async (tx) => {
        await tx.consentRecord.upsert({
          where: { sessionId: s.id },
          create: { sessionId: s.id, participantId: s.participantId, consentTextHash: hash, language: s.participant.language, clientTs: new Date(action.clientTs) },
          update: {},
        });
        // The full schedule is generated and stored as soon as the session starts (before trial 1).
        await ensureSchedule(tx, s);
        await tx.session.update({ where: { id: s.id }, data: { currentStep: "background", status: "in_progress", startedAt: s.startedAt ?? now } });
      }, { timeout: 30_000 });
      return;
    }
    case "background": {
      expectStep(s, "background");
      await prisma.$transaction(async (tx) => {
        await tx.questionnaireResponse.create({
          data: {
            participantId: s.participantId,
            sessionId: s.id,
            instrument: "background",
            instrumentVersion: "background-v1",
            responses: action.answers,
            clientTs: new Date(action.clientTs),
          },
        });
        if (s.participant.groupSource !== "admin")
          await tx.participant.update({
            where: { id: s.participantId },
            data: { group: action.answers.csOrIt === "yes" ? "cs" : "nonCs", groupSource: "self" },
          });
        await tx.session.update({ where: { id: s.id }, data: { currentStep: "instructions" } });
      });
      return;
    }
    case "instructions_done": {
      expectStep(s, "instructions");
      await prisma.session.update({ where: { id: s.id }, data: { currentStep: "practice", currentIndex: 0 } });
      return;
    }
    case "main_intro_done": {
      expectStep(s, "main_intro");
      await prisma.session.update({ where: { id: s.id }, data: { currentStep: "trials" } });
      return;
    }
    case "trial": {
      const trial = await prisma.comparisonTrial.findUnique({ where: { id: action.trialId } });
      if (!trial || trial.sessionId !== s.id) throw new ActionError("Unknown trial", 404);
      // Idempotent: a retried save of an already-answered trial is acknowledged without overwriting.
      if (trial.choice !== null) return;
      expectStep(s, "practice", "trials");
      if (trial.seq !== s.currentIndex) throw new ActionError("This is not the current trial");
      const nextIndex = trial.seq + 1;
      let nextStep: ComparisonStep = s.currentStep as ComparisonStep;
      if (trial.isPractice && nextIndex >= d.practiceTrials) nextStep = "main_intro";
      else if (!trial.isPractice && trial.trialIndex >= N) nextStep = "end";
      else if (!trial.isPractice && trial.trialIndex % d.breakEvery === 0) nextStep = "break";
      await prisma.$transaction(async (tx) => {
        const updated = await tx.comparisonTrial.updateMany({
          where: { id: trial.id, choice: null },
          data: {
            choice: action.choice,
            chosenClipId: action.choice === "left" ? trial.leftClipId : trial.rightClipId,
            rtMs: action.rtMs,
            replayCount: action.replayCount,
            clientShownAt: new Date(action.clientShownAt),
            clientBothEndedAt: new Date(action.clientBothEndedAt),
            clientRespondedAt: new Date(action.clientRespondedAt),
            serverRespondedAt: now,
          },
        });
        if (updated.count === 0) return; // concurrent duplicate
        if (nextStep === "break")
          await tx.breakRecord.upsert({
            where: { sessionId_afterTrialIndex: { sessionId: s.id, afterTrialIndex: trial.trialIndex } },
            create: { sessionId: s.id, participantId: s.participantId, afterTrialIndex: trial.trialIndex, startedAt: now },
            update: {},
          });
        if (nextStep === "end" && s.type === "phase1" && !s.participant.completionCode)
          await tx.participant.update({ where: { id: s.participantId }, data: { completionCode: generateCompletionCode() } });
        await tx.session.update({
          where: { id: s.id },
          data: {
            currentIndex: nextIndex,
            currentStep: nextStep,
            lastSeenAt: now,
            ...(nextStep === "end" ? { status: "completed", completedAt: now } : {}),
          },
        });
      });
      return;
    }
    case "break_end": {
      expectStep(s, "break");
      const afterTrialIndex = s.currentIndex - d.practiceTrials;
      await prisma.$transaction(async (tx) => {
        const br = await tx.breakRecord.findUnique({ where: { sessionId_afterTrialIndex: { sessionId: s.id, afterTrialIndex } } });
        if (br && !br.endedAt)
          await tx.breakRecord.update({ where: { id: br.id }, data: { endedAt: now, durationMs: now.getTime() - br.startedAt.getTime() } });
        await tx.session.update({ where: { id: s.id }, data: { currentStep: "trials" } });
      });
      return;
    }
  }
}
