/** Session B participant state. Never contains condition names. */
import { z } from "zod";
import type { PlanStep } from "../plans";
import type { InstrumentItem } from "../questionnaire/instruments";

export const SESSION_B_STEPS = ["locked", "welcome", "practice_task", "block_intro", "task", "quis", "ues_sf", "ranking", "end"] as const;
export type SessionBStep = (typeof SESSION_B_STEPS)[number];

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

export interface SessionBState {
  kind: "sessionB";
  step: SessionBStep;
  lang: string;
  block?: BlockView;
  totalBlocks?: number;
  questionnaire?: {
    instrument: "quis" | "ues_sf";
    blockIndex: number;
    number: number;
    title: string;
    instructions: string;
    items: InstrumentItem[];
  };
  ranking?: { interfaces: { blockIndex: number; number: number; imageUrl: string }[] };
}

const ts = z.number().int().positive();
const CartSchema = z.array(z.object({ productId: z.string().max(10), quantity: z.number().int().min(1).max(99) })).max(100);

export const SessionBActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), viewport: z.object({ w: z.number().int(), h: z.number().int() }), userAgent: z.string().max(500) }),
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
    instrument: z.enum(["quis", "ues_sf"]),
    responses: z.record(z.string(), z.union([z.number(), z.literal("NA")])),
  }),
  z.object({
    type: z.literal("ranking"),
    ranks: z.array(z.object({ blockIndex: z.number().int().min(0).max(3), rank: z.number().int().min(1).max(4), reason: z.string().max(300) })).length(4),
  }),
]);
export type SessionBAction = z.infer<typeof SessionBActionSchema>;
