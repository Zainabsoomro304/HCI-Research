import type { Prisma } from "@prisma/client";
import { CONDITIONS } from "@/config/study";
import { prisma } from "./db";
import { validatePlanFile } from "./plans";

/**
 * Validates and stores an uploaded plan file for a Phase 3 participant (one row per condition, replacing earlier
 * uploads). Task blocks freeze their own snapshot when Session B is unlocked, so later uploads never change
 * a session in progress.
 */
export async function savePlanFile(participantId: string, data: unknown, fileName?: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const v = validatePlanFile(data);
  if (!v.ok) return v;
  const p = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!p) return { ok: false, errors: ["Unknown participant"] };
  if (p.studyPhase !== 3) return { ok: false, errors: ["Adaptation plans are only for Phase 3 participants"] };
  if (v.plan.participantCode !== p.code) return { ok: false, errors: [`participantCode is ${v.plan.participantCode} but this participant is ${p.code}`] };
  await prisma.$transaction(
    CONDITIONS.map((condition) =>
      prisma.adaptationPlan.upsert({
        where: { participantId_condition: { participantId, condition } },
        create: { participantId, condition, steps: v.plan.conditions[condition].steps as Prisma.InputJsonValue, sourceFileName: fileName },
        update: { steps: v.plan.conditions[condition].steps as Prisma.InputJsonValue, sourceFileName: fileName, uploadedAt: new Date() },
      }),
    ),
  );
  return { ok: true };
}
