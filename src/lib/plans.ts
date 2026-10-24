import { z } from "zod";
import { CONDITIONS } from "@/config/study";
import { ConfigIdSchema } from "@/config/uiSpace";

/** One adaptation step: when the trigger fires, the shop animates to `config`. */
export const PlanStepSchema = z.object({
  trigger: z.object({
    /** afterMs: ms since task start. afterEvents: deliberate interaction events since the previous step. */
    type: z.enum(["afterMs", "afterEvents"]),
    value: z.number().int().min(0).max(60 * 60 * 1000),
  }),
  config: ConfigIdSchema,
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

const ConditionPlanSchema = z.object({ steps: z.array(PlanStepSchema).max(50) });

export const PlanFileSchema = z
  .object({
    participantCode: z.string().regex(/^P3-\d{3,}$/, "participantCode must look like P3-004"),
    conditions: z.object(Object.fromEntries(CONDITIONS.map((c) => [c, ConditionPlanSchema])) as Record<(typeof CONDITIONS)[number], typeof ConditionPlanSchema>).strict(),
  })
  .strict();
export type PlanFile = z.infer<typeof PlanFileSchema>;

/** Validates an uploaded plan file; returns readable error lines instead of throwing. */
export function validatePlanFile(data: unknown): { ok: true; plan: PlanFile } | { ok: false; errors: string[] } {
  const r = PlanFileSchema.safeParse(data);
  if (r.success) return { ok: true, plan: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(file)"}: ${i.message}`) };
}

/**
 * Pure trigger evaluation shared by the client engine and tests.
 * Given elapsed ms since task start, deliberate events since the last applied step, and how many steps are
 * applied, returns the number of steps that should now be applied (steps fire in order; several may fire at once).
 */
export function stepsDue(steps: readonly PlanStep[], applied: number, elapsedMs: number, eventsSinceLast: number): number {
  let n = applied;
  let events = eventsSinceLast;
  while (n < steps.length) {
    const tr = steps[n]!.trigger;
    const due = tr.type === "afterMs" ? elapsedMs >= tr.value : events >= tr.value;
    if (!due) break;
    n++;
    events = 0; // event counter restarts after each step
  }
  return n;
}
