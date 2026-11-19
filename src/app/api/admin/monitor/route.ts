import { NextResponse } from "next/server";
import { participantOverview } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

/** Live monitor data (polled every 10 s by /admin/monitor). */
export async function GET(req: Request) {
  const includeSimulated = new URL(req.url).searchParams.get("simulated") === "1";
  const rows = await participantOverview({ includeSimulated });
  return NextResponse.json({
    now: new Date().toISOString(),
    rows: rows.map((r) => ({
      code: r.participant.code,
      group: r.participant.group,
      quality: r.quality,
      sessions: r.sessions.map((s) => ({ type: s.type, status: s.status, label: s.label, lastSeenAt: s.lastSeenAt, startedAt: s.startedAt })),
    })),
  });
}
