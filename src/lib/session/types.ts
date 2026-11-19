/** State sent to the participant browser: no condition names or design flags (shopping-session plan steps carry only the config IDs the shop needs to render). */
import { z } from "zod";
import { LANGUAGES, type Lang } from "@/config/shop";
import { BackgroundSchema } from "../questionnaire/background";
import type { ShoppingState } from "./shoppingTypes";

export const COMPARISON_STEPS = ["language", "consent", "background", "ineligible", "instructions", "practice", "main_intro", "trials", "break", "end"] as const;
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
  step: ComparisonStep;
  lang: Lang;
  consent?: { markdown: string; hash: string };
  trial?: TrialView;
  progress?: { done: number; total: number };
  breakInfo?: { afterTrialIndex: number; total: number };
  /** True while content/study-info.json is incomplete: the participant sees "the study is not open yet". */
  notReady?: boolean;
  /** Shown at the end of the session, so the participant can quote it to withdraw their data. */
  participantCode?: string;
}

/** The three consent statements; every one must be ticked (information sheet, agreement, age 40 or over). */
export const CONSENT_CONFIRMATIONS = ["readInformation", "agree", "ageEligible"] as const;
export const ConsentConfirmationsSchema = z.object({ readInformation: z.literal(true), agree: z.literal(true), ageEligible: z.literal(true) });

export type ParticipantState = ComparisonState | ShoppingState;

const ts = z.number().int().positive();

export const ComparisonActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("start"),
    viewport: z.object({ w: z.number().int(), h: z.number().int() }),
    userAgent: z.string().max(500),
  }),
  z.object({ type: z.literal("language"), lang: z.enum(LANGUAGES) }),
  z.object({ type: z.literal("consent"), agreed: z.literal(true), confirmations: ConsentConfirmationsSchema, hash: z.string().length(64), clientTs: ts }),
  /** Age under MIN_AGE: only the age is stored, as a screening record. */
  z.object({ type: z.literal("screen_out"), age: z.number().int().min(0).max(110), clientTs: ts }),
  z.object({ type: z.literal("background"), answers: BackgroundSchema, clientTs: ts }),
  z.object({ type: z.literal("instructions_done") }),
  z.object({ type: z.literal("main_intro_done") }),
  z.object({
    type: z.literal("trial"),
    trialId: z.string(),
    choice: z.enum(["left", "right"]),
    /** From the moment both clips finished; null when the participant chose before they finished. */
    rtMs: z.number().int().min(0).max(24 * 3600 * 1000).nullable(),
    replayCount: z.number().int().min(0).max(1000),
    clientShownAt: ts,
    clientBothEndedAt: ts.nullable(),
    clientRespondedAt: ts,
  }),
  z.object({ type: z.literal("break_end"), clientTs: ts }),
]);
export type ComparisonAction = z.infer<typeof ComparisonActionSchema>;
