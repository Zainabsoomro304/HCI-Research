import Link from "next/link";
import { CopyButton, CreateParticipantsForm } from "@/components/admin/widgets";
import { participantOverview, type SessionSummary } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";

const TYPE_LABEL = { phase1: "Phase 1", p3_sessionA: "Session A", p3_sessionB: "Session B" } as const;

function StatusPill({ s }: { s: SessionSummary }) {
  const color = s.status === "completed" ? "bg-[#e1efea] text-[#1d4d41]" : s.status === "in_progress" ? "bg-[#fdf3dc] text-[#7a5a10]" : "bg-[#eef1f4] text-[#566070]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{s.label}</span>;
}

export default async function ParticipantsPage({ searchParams }: { searchParams: Promise<{ phase?: string }> }) {
  const { phase } = await searchParams;
  const studyPhase = phase === "1" ? 1 : phase === "3" ? 3 : undefined;
  const rows = await participantOverview({ studyPhase });
  const tabs: [string, string][] = [
    ["", "All"],
    ["1", "Phase 1"],
    ["3", "Phase 3"],
  ];
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-[#dfe3e8] bg-white p-5">
        <h1 className="mb-3 text-lg font-bold">Create participants</h1>
        <CreateParticipantsForm />
      </section>
      <section className="rounded-xl border border-[#dfe3e8] bg-white">
        <div className="flex items-center gap-2 border-b border-[#dfe3e8] px-5 py-3">
          <h2 className="mr-4 text-lg font-bold">Participants ({rows.length})</h2>
          {tabs.map(([v, label]) => (
            <Link
              key={v}
              href={v ? `/admin?phase=${v}` : "/admin"}
              className={`rounded-md px-3 py-1 text-sm font-medium ${String(studyPhase ?? "") === v ? "bg-[#1c2430] text-white" : "text-[#566070] hover:bg-[#f0f2f5]"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f8f9fb] text-left text-xs uppercase tracking-wide text-[#566070]">
              <tr>
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Group</th>
                <th className="px-4 py-2">Seed</th>
                <th className="px-4 py-2">Sessions</th>
                <th className="px-4 py-2">Attention</th>
                <th className="px-4 py-2">Consistency</th>
                <th className="px-4 py-2">Plans</th>
                <th className="px-4 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ participant: p, sessions, quality: q, plansUploaded }) => (
                <tr key={p.id} className="border-t border-[#eef1f4] align-top">
                  <td className="px-4 py-2.5 font-mono font-semibold">
                    <Link href={`/admin/p/${p.code}`} className="text-[#2b6a5a] hover:underline">
                      {p.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {p.group}
                    {p.groupSource === "admin" && <span className="ml-1 text-xs text-[#566070]">(set)</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{p.seed}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-1.5">
                      {sessions.map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="w-20 text-xs text-[#566070]">{TYPE_LABEL[s.type]}</span>
                          <StatusPill s={s} />
                          <CopyButton text={s.link} label="Copy link" />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {q.attentionTotal === 0 ? (
                      <span className="text-[#8a929e]">–</span>
                    ) : (
                      <span className={q.attentionFailed ? "font-semibold text-[#b03a27]" : ""}>
                        {q.attentionCorrect}/{q.attentionAnswered}
                        {q.attentionFailed ? " failed" : q.attentionAnswered < q.attentionTotal ? ` (of ${q.attentionTotal})` : " ✓"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{q.consistencyPct === null ? <span className="text-[#8a929e]">–</span> : `${q.consistencyPct}% (${q.repeatsConsistent}/${q.repeatsAnswered})`}</td>
                  <td className="px-4 py-2.5">{p.studyPhase === 3 ? `${plansUploaded}/4` : <span className="text-[#8a929e]">–</span>}</td>
                  <td className="max-w-48 truncate px-4 py-2.5 text-xs text-[#566070]">{p.notes}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[#566070]">
                    No participants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
