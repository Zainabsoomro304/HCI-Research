import { NextResponse } from "next/server";
import { ActionError } from "@/lib/session";
import { unlockShopping } from "@/lib/session/shopping";

export const dynamic = "force-dynamic";

/** Researcher starts the shopping session, Session 2 (requires all 4 adaptation plans). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await unlockShopping(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
