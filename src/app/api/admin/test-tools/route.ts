import { NextResponse } from "next/server";
import { z } from "zod";
import { FreezeError, testToolsEnabled } from "@/lib/prepare/freeze";
import { createSimulatedParticipants, simulateComparison, simulateShopping } from "@/lib/prepare/simulate";
import { ActionError } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), count: z.number().int().min(1).max(200), urduShare: z.number().min(0).max(1), seed: z.number().int().min(0) }),
  z.object({ action: z.literal("simulate_comparison"), participantId: z.string() }),
  z.object({ action: z.literal("simulate_shopping"), participantId: z.string() }),
]);

/** One participant per simulate request, so a long list can never hit a time limit; the page shows the progress. */
export async function POST(req: Request) {
  if (!testToolsEnabled()) return NextResponse.json({ error: "Test tools are off on this deployment." }, { status: 403 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    if (body.data.action === "create") return NextResponse.json({ created: await createSimulatedParticipants(body.data) });
    if (body.data.action === "simulate_comparison") await simulateComparison(body.data.participantId);
    else await simulateShopping(body.data.participantId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FreezeError || e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
