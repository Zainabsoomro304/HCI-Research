/** Shopping session (Session 2) participant state. Never contains condition names. */
import { z } from "zod";
import type { Lang } from "@/config/shop";
import type { PlanStep } from "../plans";
import type { InstrumentItem, InstrumentScale } from "../questionnaire/instruments";
import { ConsentConfirmationsSchema } from "./types";

/**
 * locked (until the researcher starts it) -> consent (re-confirmation) -> welcome -> practice_task ->
 * 4 x (block_intro -> task -> seq -> sus) -> ranking -> end.
 */
export const SHOPPING_STEPS = ["locked", "consent", "welcome", "practice_task", "block_intro", "task", "seq", "sus", "ranking", "end"] as const;
export type ShoppingStep = (typeof SHOPPING_STEPS)[number];

export interface TaskView {
  title: string;
  instructions: string;
  budget: number;
  requiredItems: { id: string; description: string }[];
}

export interface BlockView {
  blockId: string;
  /** -1 = practice task, 0-3 = task blocks. */
  blockIndex: number;
  /** 1-4 as shown to the participant (0 for practice). */
  number: number;
  isPractice: boolean;
  task: TaskView;
  steps: PlanStep[];
  /** Server-measured ms since the task started (null if not started), so trigger timing is immune to clock skew. */
  elapsedMs: number | null;
  resume?: {
    cart: { productId: string; quantity: number }[];
    appliedSteps: number;
    eventsSinceLast: number;
    appliedConfigs: { step: number; configId: string; atMs: number }[];
    firstInteractionAt: number | null;
  };
}

export interface ShoppingState {
  kind: "shopping";
  step: ShoppingStep;
  lang: Lang;
  consent?: { markdown: string; hash: string };
  /** True while content/study-info.json is incomplete. */
  notReady?: boolean;
  /** Shown at the end of the session, so the participant can quote it to withdraw their data. */
  participantCode?: string;
  block?: BlockView;
  totalBlocks?: number;
  questionnaire?: {
    instrument: "seq" | "sus";
    blockIndex: number;
    number: number;
    title: string;
    instructions: string;
    scale: InstrumentScale;
    items: InstrumentItem[];
  };
  ranking?: { interfaces: { blockIndex: number; number: number; imageUrl: string }[] };
}

const ts = z.number().int().positive();
const CartSchema = z.array(z.object({ productId: z.string().max(10), quantity: z.number().int().min(1).max(99) })).max(100);

export const ShoppingActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), viewport: z.object({ w: z.number().int(), h: z.number().int() }), userAgent: z.string().max(500) }),
  z.object({ type: z.literal("consent"), agreed: z.literal(true), confirmations: ConsentConfirmationsSchema, hash: z.string().length(64), clientTs: ts }),
  z.object({ type: z.literal("welcome_done") }),
  z.object({ type: z.literal("block_intro_done"), blockIndex: z.number().int().min(0).max(3) }),
  z.object({
    type: z.literal("task_finish"),
    blockIndex: z.number().int().min(-1).max(3),
    cart: CartSchema,
    firstInteractionAt: ts.nullable(),
    finalConfigId: z.string().max(64),
    appliedConfigs: z.array(z.object({ step: z.number().int(), configId: z.string().max(64), atMs: z.number().int().min(0) })).max(100),
    clientTs: ts,
  }),
  z.object({
    type: z.literal("questionnaire"),
    blockIndex: z.number().int().min(0).max(3),
    instrument: z.enum(["seq", "sus"]),
    responses: z.record(z.string(), z.union([z.number(), z.literal("NA")])),
  }),
  z.object({
    type: z.literal("ranking"),
    ranks: z.array(z.object({ blockIndex: z.number().int().min(0).max(3), rank: z.number().int().min(1).max(4), reason: z.string().max(300) })).length(4),
  }),
]);
export type ShoppingAction = z.infer<typeof ShoppingActionSchema>;
