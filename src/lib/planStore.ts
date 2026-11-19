import type { Prisma } from "@prisma/client";
import { CONDITIONS } from "@/config/study";
import { prisma } from "./db";
import { validatePlanFile } from "./plans";

/**
 * Validates and stores an uploaded plan file for a participant (one row per condition, replacing earlier
 * uploads). Task blocks freeze their own snapshot when the shopping session is unlocked, so later uploads never change
 * a session in progress.
 */
export async function savePlanFile(participantId: string, data: unknown, fileName?: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const v = validatePlanFile(data);
  if (!v.ok) return v;
  const p = await prisma.participant.findUnique({ where: { id: participantId } });
  if (!p) return { ok: false, errors: ["Unknown participant"] };
  if (v.plan.participantCode !== p.code) return { ok: false, errors: [`participantCode is ${v.plan.participantCode} but this participant is ${p.code}`] };
  await prisma.$transaction([
    ...CONDITIONS.map((condition) =>
      prisma.adaptationPlan.upsert({
        where: { participantId_condition: { participantId, condition } },
        create: { participantId, condition, steps: v.plan.conditions[condition].steps as Prisma.InputJsonValue, source: "uploaded", sourceFileName: fileName },
        update: { steps: v.plan.conditions[condition].steps as Prisma.InputJsonValue, source: "uploaded", frozenModelId: null, sourceFileName: fileName, uploadedAt: new Date() },
      }),
    ),
    prisma.adminAction.create({ data: { action: "plan_upload", details: { code: p.code, fileName: fileName ?? null } } }),
  ]);
  return { ok: true };
}
