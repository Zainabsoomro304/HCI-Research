/** State sent to the participant's browser. Contains no config IDs, condition names or design flags. */
import { z } from "zod";
import { BackgroundSchema } from "../questionnaire/background";

export const COMPARISON_STEPS = ["consent", "background", "instructions", "practice", "main_intro", "trials", "break", "end"] as const;
export type ComparisonStep = (typeof COMPARISON_STEPS)[number];

export interface TrialView {
  id: string;
  trialIndex: number;
  total: number;
  isPractice: boolean;
  /** "chooseB" for attention checks. */
  question: "normal" | "chooseB";
  leftUrl: string;
  rightUrl: string;
  /** Clips of the next trial, for preloading. */
  preloadUrls: string[];
}

export interface ComparisonState {
  kind: "comparison";
  sessionType: "phase1" | "p3_sessionA";
  step: ComparisonStep;
  lang: string;
  consent?: { markdown: string; hash: string };
  trial?: TrialView;
  progress?: { done: number; total: number };
  breakInfo?: { afterTrialIndex: number; total: number };
  end?: { completionCode: string | null; variant: "phase1" | "sessionA" };
}

export type ParticipantState = ComparisonState | import("./sessionBTypes").SessionBState;

const ts = z.number().int().positive();

export const ComparisonActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    viewport: z.object({ w: z.number().int(), h: z.number().int() }),
    userAgent: z.string().max(500),
  }),
  z.object({ type: z.literal("consent"), agreed: z.literal(true), hash: z.string().length(64), clientTs: ts }),
  z.object({ type: z.literal("background"), answers: BackgroundSchema, clientTs: ts }),
  z.object({ type: z.literal("instructions_done") }),
  z.object({ type: z.literal("main_intro_done") }),
  z.object({
    type: z.literal("trial"),
    trialId: z.string(),
    choice: z.enum(["left", "right"]),
    rtMs: z.number().int().min(0).max(24 * 3600 * 1000),
    replayCount: z.number().int().min(0).max(1000),
    clientShownAt: ts,
    clientBothEndedAt: ts,
    clientRespondedAt: ts,
  }),
  z.object({ type: z.literal("break_end"), clientTs: ts }),
]);
export type ComparisonAction = z.infer<typeof ComparisonActionSchema>;
