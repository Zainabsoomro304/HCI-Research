import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { EventBatchSchema } from "@/lib/events";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Receives batched interaction events (fetch or sendBeacon). Idempotent: events are keyed by their
 * client-generated ID, so retries and late beacons never create duplicates. Late batches (even after
 * the session has completed) are always stored.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = EventBatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });

  const { token, events } = parsed.data;
  const session = await prisma.session.findUnique({ where: { token }, select: { id: true, participantId: true } });
  if (!session) return NextResponse.json({ error: "Unknown session" }, { status: 404 });

  const result = await prisma.event.createMany({
    data: events.map((e) => ({
      clientEventId: e.id,
      participantId: session.participantId,
      sessionId: session.id,
      trialId: e.trialId ?? null,
      configId: e.configId ?? null,
      type: e.type,
      clientTs: new Date(e.ts),
      clientTsMs: BigInt(e.ts),
      payload: (e.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      isPractice: e.practice ?? false,
    })),
    skipDuplicates: true,
  });
  await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return NextResponse.json({ received: events.length, saved: result.count });
}
