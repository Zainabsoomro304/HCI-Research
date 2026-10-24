import { NextResponse } from "next/server";
import { ActionError } from "@/lib/session";
import { unlockSessionB } from "@/lib/session/sessionB";

export const dynamic = "force-dynamic";

/** Researcher starts Session B (requires all 4 adaptation plans). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await unlockSessionB(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
