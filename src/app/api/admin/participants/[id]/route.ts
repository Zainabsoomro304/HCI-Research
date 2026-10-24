import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { LANGUAGES } from "@/lib/strings";

export const dynamic = "force-dynamic";

const Body = z.object({
  group: z.enum(["cs", "nonCs", "unknown"]).optional(),
  language: z.string().refine((l) => LANGUAGES.includes(l), "Unsupported language").optional(),
  seed: z.number().int().min(1).max(2147483647).optional(),
  notes: z.string().max(2000).nullable().optional(),
  conditionRowOverride: z.number().int().min(0).max(3).nullable().optional(),
  taskRowOverride: z.number().int().min(0).max(3).nullable().optional(),
});

/** Edits a participant. The seed is locked once a schedule exists; Latin-square overrides once Session B is unlocked. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: z.prettifyError(body.error) }, { status: 400 });
  const p = await prisma.participant.findUnique({ where: { id }, include: { sessions: true, _count: { select: { trials: true } } } });
  if (!p) return NextResponse.json({ error: "Unknown participant" }, { status: 404 });
  const d = body.data;
  if (d.seed !== undefined && d.seed !== p.seed && p._count.trials > 0)
    return NextResponse.json({ error: "The seed cannot be changed after the trial schedule has been generated." }, { status: 409 });
  const sbUnlocked = p.sessions.some((s) => s.type === "p3_sessionB" && s.unlockedAt);
  if ((d.conditionRowOverride !== undefined || d.taskRowOverride !== undefined) && sbUnlocked)
    return NextResponse.json({ error: "Latin-square rows cannot be changed after Session B has started." }, { status: 409 });
  const updated = await prisma.participant.update({
    where: { id },
    data: {
      ...(d.group !== undefined && d.group !== p.group ? { group: d.group, groupSource: d.group === "unknown" ? null : "admin" } : {}),
      ...(d.language !== undefined ? { language: d.language } : {}),
      ...(d.seed !== undefined ? { seed: d.seed } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      ...(d.conditionRowOverride !== undefined ? { conditionRowOverride: d.conditionRowOverride } : {}),
      ...(d.taskRowOverride !== undefined ? { taskRowOverride: d.taskRowOverride } : {}),
    },
  });
  return NextResponse.json({ ok: true, participant: { code: updated.code } });
}
