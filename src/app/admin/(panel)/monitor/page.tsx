"use client";

import { useEffect, useState } from "react";

interface Row {
  code: string;
  group: string;
  quality: { attentionCorrect: number; attentionAnswered: number; attentionFailed: boolean; consistencyPct: number | null };
  sessions: { type: string; status: string; label: string; lastSeenAt: string | null; startedAt: string | null }[];
}

function ago(iso: string | null, now: number) {
  if (!iso) return "–";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

/** Live monitor: refreshes every 10 s. Active sessions (seen in the last 2 minutes) are highlighted. */
export default function MonitorPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [now, setNow] = useState(Date.now());
  const [updated, setUpdated] = useState<string>("");
  const [onlyActive, setOnlyActive] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetch("/api/admin/monitor", { cache: "no-store" }).catch(() => null);
      if (!res?.ok || !alive) return;
      const body = (await res.json()) as { now: string; rows: Row[] };
      setRows(body.rows);
      setNow(Date.now());
      setUpdated(new Date().toLocaleTimeString());
    };
    void load();
    const id = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const lines = rows.flatMap((r) => r.sessions.map((s) => ({ ...s, code: r.code, group: r.group, quality: r.quality })));
  const active = (l: (typeof lines)[number]) => l.status === "in_progress" && !!l.lastSeenAt && now - new Date(l.lastSeenAt).getTime() < 120_000;
  const shown = lines.filter((l) => (onlyActive ? active(l) : l.status !== "not_started"));
  return (
    <section className="rounded-xl border border-[#dfe3e8] bg-white">
      <div className="flex items-center gap-4 border-b border-[#dfe3e8] px-5 py-3">
        <h1 className="text-lg font-bold">Live monitor</h1>
        <span className="text-sm text-[#566070]">
          {lines.filter(active).length} active · {lines.filter((l) => l.status === "completed").length} completed · updated {updated || "…"} (every 10 s)
        </span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> only active
        </label>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-[#f8f9fb] text-left text-xs uppercase tracking-wide text-[#566070]">
          <tr>
            <th className="px-4 py-2">Code</th>
            <th className="px-4 py-2">Session</th>
            <th className="px-4 py-2">Progress</th>
            <th className="px-4 py-2">Last seen</th>
            <th className="px-4 py-2">Attention</th>
            <th className="px-4 py-2">Consistency</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((l) => (
            <tr key={`${l.code}-${l.type}`} className={`border-t border-[#eef1f4] ${active(l) ? "bg-[#f1f8f5]" : ""}`}>
              <td className="px-4 py-2 font-mono font-semibold">{l.code}</td>
              <td className="px-4 py-2">{l.type}</td>
              <td className="px-4 py-2">{l.label}</td>
              <td className="px-4 py-2">{ago(l.lastSeenAt, now)}</td>
              <td className={`px-4 py-2 ${l.quality.attentionFailed ? "font-semibold text-[#b03a27]" : ""}`}>
                {l.quality.attentionAnswered ? `${l.quality.attentionCorrect}/${l.quality.attentionAnswered}` : "–"}
              </td>
              <td className="px-4 py-2">{l.quality.consistencyPct === null ? "–" : `${l.quality.consistencyPct}%`}</td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-[#566070]">
                Nothing to show yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
