import { NextResponse } from "next/server";
import { participantOverview } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

/** Live monitor data (polled every 10 s by /admin/monitor). */
export async function GET(req: Request) {
  const phase = Number(new URL(req.url).searchParams.get("phase")) || undefined;
  const rows = await participantOverview({ studyPhase: phase });
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
