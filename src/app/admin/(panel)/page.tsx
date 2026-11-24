import Link from "next/link";
import { StudyInfoBanner } from "@/components/admin/StudyInfoBanner";
import { CopyButton, CreateParticipantsForm } from "@/components/admin/widgets";
import { LATIN_BALANCE_GROUP } from "@/config/study";
import { SESSION_LABEL, participantOverview, type SessionSummary } from "@/lib/admin/overview";

export const dynamic = "force-dynamic";


function StatusPill({ s }: { s: SessionSummary }) {
  const color = s.status === "completed" ? "bg-[#e1efea] text-[#1d4d41]" : s.status === "in_progress" ? "bg-[#fdf3dc] text-[#7a5a10]" : "bg-[#eef1f4] text-[#566070]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{s.label}</span>;
}

export default async function ParticipantsPage({ searchParams }: { searchParams: Promise<{ simulated?: string }> }) {
  const { simulated } = await searchParams;
  const showSimulated = simulated === "1";
  const rows = await participantOverview({ includeSimulated: showSimulated });
  const realActive = rows.filter((r) => !r.participant.isSimulated && !r.participant.withdrawnAt).length;
  const tabs: [string, string][] = [
    ["", "Participants"],
    ["1", "Including simulated"],
  ];
  return (
    <div className="flex flex-col gap-6">
      <StudyInfoBanner />
      <section className="rounded-xl border border-[#dfe3e8] bg-white p-5">
        <h1 className="mb-3 text-lg font-bold">Create participants</h1>
        <CreateParticipantsForm />
        <p className="mt-3 text-sm text-[#566070]">Everyone does Session 1 (comparisons), then Session 2 (shopping, in person). Codes are P-001, P-002, … The number of participants is open.</p>
        {realActive % LATIN_BALANCE_GROUP !== 0 && (
          <p className="mt-2 rounded-md bg-[#eef3fb] px-3 py-2 text-sm text-[#2a4a7a]" data-testid="latin-note">
            For information: {realActive} active participant{realActive === 1 ? "" : "s"}. The two Latin squares (condition order and task order) are fully balanced in groups of {LATIN_BALANCE_GROUP}. Other numbers work; the orders are then only approximately balanced. Nothing is blocked.
          </p>
        )}
      </section>
      <section className="rounded-xl border border-[#dfe3e8] bg-white">
        <div className="flex items-center gap-2 border-b border-[#dfe3e8] px-5 py-3">
          <h2 className="mr-4 text-lg font-bold">Participants ({rows.length})</h2>
          {tabs.map(([v, label]) => (
            <Link
              key={v}
              href={v ? `/admin?simulated=${v}` : "/admin"}
              className={`rounded-md px-3 py-1 text-sm font-medium ${(showSimulated ? "1" : "") === v ? "bg-[#1c2430] text-white" : "text-[#566070] hover:bg-[#f0f2f5]"}`}
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
                    {p.legacyCode && <div className="text-[11px] font-normal text-[#566070]">was {p.legacyCode}</div>}
                    {p.protocol !== "current" && <div className="text-[11px] font-semibold text-[#b03a27]">{p.protocol}</div>}
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
                          <span className="w-40 text-xs text-[#566070]">{SESSION_LABEL[s.type]}</span>
                          <StatusPill s={s} />
                          <CopyButton text={s.link} label="Copy link" />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{q.consistencyPct === null ? <span className="text-[#8a929e]">–</span> : `${q.consistencyPct}% (${q.repeatsConsistent}/${q.repeatsAnswered})`}</td>
                  <td className="px-4 py-2.5">{plansUploaded}/4</td>
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
