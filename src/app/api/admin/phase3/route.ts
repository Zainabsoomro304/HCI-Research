import { NextResponse } from "next/server";
import { z } from "zod";
import { ActionError } from "@/lib/session";
import { FreezeError, generateLatePlan, reinstateParticipant, startFreeze, stepFreeze, unfreeze, withdrawParticipant } from "@/lib/phase3/freeze";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Each request computes for at most this long, well inside the serverless limit; the page keeps calling until done. */
const STEP_BUDGET_MS = 20_000;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("freeze_start") }),
  z.object({ action: z.literal("freeze_step"), jobId: z.string() }),
  z.object({ action: z.literal("unfreeze"), phrase: z.string().max(200), reason: z.string().max(1000) }),
  z.object({ action: z.literal("withdraw"), participantId: z.string(), reason: z.string().max(1000) }),
  z.object({ action: z.literal("reinstate"), participantId: z.string() }),
  z.object({ action: z.literal("late_plan"), participantId: z.string() }),
]);

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    switch (body.data.action) {
      case "freeze_start":
        return NextResponse.json(await startFreeze());
      case "freeze_step":
        return NextResponse.json(await stepFreeze(body.data.jobId, STEP_BUDGET_MS));
      case "unfreeze":
        await unfreeze(body.data.phrase, body.data.reason);
        break;
      case "withdraw":
        await withdrawParticipant(body.data.participantId, body.data.reason);
        break;
      case "reinstate":
        await reinstateParticipant(body.data.participantId);
        break;
      case "late_plan":
        await generateLatePlan(body.data.participantId);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof FreezeError || e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
