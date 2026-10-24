import { z } from "zod";

export const EVENT_TYPES = [
  "page_view",
  "category_select",
  "search_query",
  "product_open",
  "product_close",
  "add_to_cart",
  "remove_from_cart",
  "quantity_change",
  "cart_open",
  "cart_close",
  "scroll",
  "adaptation_applied",
  "task_start",
  "task_finish",
  "visibility_change",
  // comparison-session extras
  "clip_play",
  "clip_ended",
  "clip_replay",
  "trial_shown",
  "break_start",
  "break_end",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ClientEventSchema = z.object({
  /** Client-generated UUID, used for idempotent inserts. */
  id: z.string().min(8).max(64),
  type: z.enum(EVENT_TYPES),
  /** Client epoch milliseconds. */
  ts: z.number().int().positive(),
  configId: z.string().max(64).nullish(),
  trialId: z.string().max(64).nullish(),
  practice: z.boolean().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type ClientEvent = z.infer<typeof ClientEventSchema>;

export const EventBatchSchema = z.object({
  token: z.string().min(8).max(128),
  events: z.array(ClientEventSchema).min(1).max(500),
});
export type EventBatch = z.infer<typeof EventBatchSchema>;
