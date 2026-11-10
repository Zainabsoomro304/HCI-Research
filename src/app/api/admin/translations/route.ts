import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { translationItems } from "@/lib/translations";

export const dynamic = "force-dynamic";

/** Marks one Urdu string as reviewed by a native speaker. */
export async function POST(req: Request) {
  const body = z.object({ key: z.string().max(200), note: z.string().max(500).optional() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!translationItems().some((i) => i.key === body.data.key)) return NextResponse.json({ error: "Unknown string" }, { status: 404 });
  await prisma.translationReview.upsert({ where: { key: body.data.key }, create: { key: body.data.key, note: body.data.note }, update: { reviewedAt: new Date(), note: body.data.note } });
  return NextResponse.json({ ok: true });
}
