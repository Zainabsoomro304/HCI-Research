import type { Participant, Session } from "@prisma/client";
import { COMPARISON_DESIGN, CONDITIONS, totalAnalysisTrials, type StudyPhase } from "@/config/study";
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
  welcome: "Welcome",
  practice_task: "Practice task",
  block_intro: "Task intro",
  task: "Shopping task",
  quis: "QUIS",
  ues_sf: "UES-SF",
  ranking: "Final ranking",
};

export function sessionLabel(s: Session, studyPhase: number, plansUploaded: number): string {
  if (s.status === "completed") return "Completed";
  if (s.type === "p3_sessionB") {
    if (!s.unlockedAt) return plansUploaded < CONDITIONS.length ? `Waiting for plans (${plansUploaded}/${CONDITIONS.length})` : "Ready to start";
    const block = ["block_intro", "task", "quis", "ues_sf"].includes(s.currentStep) ? ` – task ${s.currentIndex + 1}/4` : "";
    return `In progress: ${STEP_LABELS[s.currentStep] ?? s.currentStep}${block}`;
  }
  if (!s.startedAt && s.currentStep === "consent") return "Not started";
  const d = COMPARISON_DESIGN[studyPhase as StudyPhase] ?? COMPARISON_DESIGN[1];
  const trial = s.currentStep === "trials" || s.currentStep === "break" ? ` – trial ${Math.min(s.currentIndex - d.practiceTrials + 1, totalAnalysisTrials(d))}/${totalAnalysisTrials(d)}` : "";
  return `In progress: ${STEP_LABELS[s.currentStep] ?? s.currentStep}${trial}`;
}

export async function participantOverview(filter: { studyPhase?: number; code?: string } = {}): Promise<ParticipantSummary[]> {
  const participants = await prisma.participant.findMany({
    where: { ...(filter.studyPhase ? { studyPhase: filter.studyPhase } : {}), ...(filter.code ? { code: filter.code } : {}) },
    orderBy: [{ studyPhase: "asc" }, { number: "asc" }],
    include: {
      sessions: true,
      plans: { select: { condition: true } },
      trials: { select: { id: true, isAttentionCheck: true, isRepeat: true, repeatOfTrialId: true, choice: true, chosenClipId: true } },
    },
  });
  const typeOrder = { phase1: 0, p3_sessionA: 1, p3_sessionB: 2 } as const;
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
        label: sessionLabel(s, p.studyPhase, plans.length),
        link: sessionLink(s.token),
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        lastSeenAt: s.lastSeenAt,
        appVersion: s.appVersion,
        unlocked: !!s.unlockedAt,
      })),
  }));
}
