import type { Participant, Session } from "@prisma/client";
import { COMPARISON_DESIGN, CONDITIONS, totalAnalysisTrials } from "@/config/study";
import { prisma } from "../db";
import { sessionLink } from "../participants";
import { computeQuality, type QualityMetrics } from "./quality";

export interface SessionSummary {
  id: string;
  type: Session["type"];
  status: Session["status"];
  label: string;
  link: string;
  startedAt: Date | null;
  completedAt: Date | null;
  lastSeenAt: Date | null;
  appVersion: string | null;
  unlocked: boolean;
}

export interface ParticipantSummary {
  participant: Participant;
  sessions: SessionSummary[];
  quality: QualityMetrics;
  plansUploaded: number;
  scheduleGenerated: boolean;
}

const STEP_LABELS: Record<string, string> = {
  consent: "Consent",
  background: "Background questionnaire",
  instructions: "Instructions",
  practice: "Practice",
  main_intro: "Practice done",
  trials: "Trials",
  break: "Break",
  end: "End",
  ineligible: "Screened out",
  language: "Language choice",
  welcome: "Welcome",
  practice_task: "Practice task",
  block_intro: "Task intro",
  task: "Shopping task",
  seq: "SEQ",
  sus: "SUS",
  ranking: "Final ranking",
};

/** Admin-facing names of the two sessions. */
export const SESSION_LABEL = { comparison: "Session 1 · comparisons", shopping: "Session 2 · shopping" } as const;

/** `analysisTrials`: the session's stored analysis trials (82 for sessions started before 2026-11-23), if known. */
export function sessionLabel(s: Session, plansUploaded: number, analysisTrials?: number): string {
  if (s.status === "completed") return s.type === "comparison" ? "Session 1 complete" : "Session 2 complete";
  if (s.type === "shopping") {
    if (!s.unlockedAt) return plansUploaded < CONDITIONS.length ? `Waiting for plans (${plansUploaded}/${CONDITIONS.length})` : "Ready to start";
    const block = ["block_intro", "task", "seq", "sus"].includes(s.currentStep) ? ` – task ${s.currentIndex + 1}/4` : "";
    return `In progress: ${STEP_LABELS[s.currentStep] ?? s.currentStep}${block}`;
  }
  if (!s.startedAt && (s.currentStep === "consent" || s.currentStep === "language")) return "Not started";
  const d = COMPARISON_DESIGN;
  const total = analysisTrials || totalAnalysisTrials(d);
  const trial = s.currentStep === "trials" || s.currentStep === "break" ? ` – trial ${Math.min(s.currentIndex - d.practiceTrials + 1, total)}/${total}` : "";
  return `In progress: ${STEP_LABELS[s.currentStep] ?? s.currentStep}${trial}`;
}

export async function participantOverview(filter: { code?: string; includeSimulated?: boolean } = {}): Promise<ParticipantSummary[]> {
  const participants = await prisma.participant.findMany({
    where: { ...(filter.code ? { code: filter.code } : {}), ...(filter.includeSimulated === false ? { isSimulated: false } : {}) },
    orderBy: [{ isSimulated: "asc" }, { number: "asc" }],
    include: {
      sessions: true,
      plans: { select: { condition: true } },
      trials: { select: { id: true, sessionId: true, isPractice: true, isAttentionCheck: true, isRepeat: true, repeatOfTrialId: true, choice: true, chosenClipId: true } },
    },
  });
  const typeOrder = { comparison: 0, shopping: 1 } as const;
  return participants.map(({ sessions, plans, trials, ...p }) => ({
    participant: p,
    plansUploaded: plans.length,
    scheduleGenerated: trials.length > 0,
    quality: computeQuality(trials),
    sessions: sessions
      .sort((a, b) => typeOrder[a.type] - typeOrder[b.type])
      .map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        label: sessionLabel(s, plans.length, trials.filter((t) => t.sessionId === s.id && !t.isPractice).length),
        link: sessionLink(s.token),
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        lastSeenAt: s.lastSeenAt,
        appVersion: s.appVersion,
        unlocked: !!s.unlockedAt,
      })),
  }));
}
