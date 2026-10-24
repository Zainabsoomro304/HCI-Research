import { NextResponse } from "next/server";
import { z } from "zod";
import { createParticipants } from "@/lib/participants";

export const dynamic = "force-dynamic";

const Body = z.object({
  studyPhase: z.union([z.literal(1), z.literal(3)]),
  count: z.number().int().min(1).max(200),
  group: z.enum(["cs", "nonCs", "unknown"]).optional(),
  language: z.string().max(10).optional(),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: z.prettifyError(body.error) }, { status: 400 });
  const created = await createParticipants(body.data);
  return NextResponse.json({ created: created.map((p) => p.code) });
}
