import { NextResponse } from "next/server";
import { ActionError, applyAction, buildState, getSessionByToken } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Current participant state (used on load and to resynchronise after errors). */
export async function GET(_req: Request, { params }: Ctx) {
  const s = await getSessionByToken((await params).token);
  if (!s) return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  return NextResponse.json({ state: await buildState(s) });
}

/** Applies one participant action and returns the new state. Every action is persisted before responding. */
export async function POST(req: Request, { params }: Ctx) {
  const token = (await params).token;
  const s = await getSessionByToken(token);
  if (!s) return NextResponse.json({ error: "Unknown link" }, { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    await applyAction(s, body);
  } catch (e) {
    if (e instanceof ActionError) {
      const fresh = await getSessionByToken(token);
      return NextResponse.json({ error: e.message, state: fresh ? await buildState(fresh) : undefined }, { status: e.status });
    }
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
  const fresh = await getSessionByToken(token);
  return NextResponse.json({ state: await buildState(fresh!) });
}
