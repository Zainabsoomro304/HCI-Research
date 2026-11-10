import Link from "next/link";
import { stillUrl } from "@/lib/media";
import { FreezePanel, LatePlanActions, ReinstateButton, TestTools, UnfreezePanel, WithdrawButton } from "@/components/admin/Phase3";
import { CopyButton } from "@/components/admin/widgets";
import { ACTIVE_FREEZE_PHRASE } from "@/config/planEngine";
import { activeFrozenModel, freezeReadiness, phase3Status, testToolsEnabled, type ExcludedEntry, type FrozenResult } from "@/lib/phase3/freeze";
import type { SimulatedTruth } from "@/lib/phase3/simulate";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const box = "rounded-xl border border-[#dfe3e8] bg-white p-5";

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-lg bg-[#f5f6f8] px-4 py-3">
      <div className={`text-2xl font-bold ${tone === "warn" && value > 0 ? "text-[#b03a27]" : ""}`}>{value}</div>
      <div className="text-xs text-[#566070]">{label}</div>
    </div>
  );
}

function Thumb({ id }: { id: string }) {
  return (
    <figure className="w-28">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={stillUrl(id, "en")} alt={id} loading="lazy" className="aspect-[16/10] w-full rounded border border-[#dfe3e8] object-cover" />
      <figcaption className="mt-0.5 break-all font-mono text-[10px] leading-tight text-[#566070]">{id}</figcaption>
    </figure>
  );
}

function flagsOf(r: FrozenResult): string[] {
  const out: string[] = [];
  if (r.flags.agentMismatch) out.push(`agent/argmax mismatch: ${r.agent.mismatches.join(", ")}`);
  if (r.flags.identicalTargets.length) out.push(`identical: ${r.flags.identicalTargets.join(", ")}`);
  if (r.flags.equalsGlobal.length) out.push(`equals global: ${r.flags.equalsGlobal.join(", ")}`);
  if (r.flags.nearTie.length) out.push(`near-tie: ${r.flags.nearTie.join(", ")}`);
  if (r.attentionFailed) out.push("failed attention check");
  if (r.late) out.push("late");
  if (r.planSource === "uploaded") out.push("uploaded override kept");
  return out;
}

export default async function Phase3Page() {
  const [rows, readiness, frozen] = await Promise.all([phase3Status(), freezeReadiness(), activeFrozenModel()]);
  const tools = testToolsEnabled();
  const results = (frozen?.results ?? []) as unknown as FrozenResult[];
  const excluded = (frozen?.excluded ?? []) as unknown as ExcludedEntry[];
  const warnings = (frozen?.warnings ?? []) as unknown as string[];
  const inFrozen = new Set(results.map((r) => r.code));
  const late = frozen ? rows.filter((r) => r.status === "completed" && !inFrozen.has(r.code) && !r.attentionFailed) : [];
  const counts = {
    complete: rows.filter((r) => r.status === "completed").length,
    inProgress: rows.filter((r) => r.status === "in_progress").length,
    notStarted: rows.filter((r) => r.status === "not_started").length,
    failed: rows.filter((r) => r.attentionFailed && r.status !== "withdrawn").length,
    withdrawn: rows.filter((r) => r.status === "withdrawn").length,
  };

  const simulated = tools ? await prisma.participant.findMany({ where: { isSimulated: true }, select: { id: true, code: true, simulatedTruth: true } }) : [];
  const truthByCode = new Map(simulated.map((p) => [p.code, p.simulatedTruth as unknown as SimulatedTruth]));
  const truthRows = results.filter((r) => truthByCode.has(r.code));
  const share = (condition: "global" | "cluster5" | "personalFull") => (truthRows.length ? Math.round((100 * truthRows.filter((r) => r.targets[condition] === truthByCode.get(r.code)!.bestTarget).length) / truthRows.length) : 0);
  const simRows = rows.filter((r) => r.isSimulated);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Phase 3 preparation</h1>

      <section className={box}>
        <h2 className="font-bold">Status</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Session A complete" value={counts.complete} />
          <Stat label="In progress" value={counts.inProgress} />
          <Stat label="Not started" value={counts.notStarted} />
          <Stat label="Failed attention checks" value={counts.failed} tone="warn" />
          <Stat label="Withdrawn" value={counts.withdrawn} />
        </div>
        {readiness.ready ? (
          <p className="mt-4 rounded-md bg-[#e1efea] px-3 py-2 text-sm font-semibold text-[#1d4d41]" data-testid="readiness">
            Ready: every active participant has finished Session A.
          </p>
        ) : (
          <ul className="mt-4 list-disc rounded-md bg-[#fdf3dc] py-2 pl-7 pr-3 text-sm text-[#7a5a10]" data-testid="readiness">
            {readiness.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
        {readiness.unfinished.length > 0 && (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[#566070]">
                <th className="py-1 pr-4">Participant</th>
                <th className="py-1 pr-4">Session A</th>
                <th className="py-1 pr-4">Link</th>
                <th className="py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {readiness.unfinished.map((r) => (
                <tr key={r.id} className="border-t border-[#eef1f4]">
                  <td className="py-1.5 pr-4 font-mono">
                    <Link className="underline" href={`/admin/p/${r.code}`}>
                      {r.code}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-4">{r.sessionALabel}</td>
                  <td className="py-1.5 pr-4">{r.sessionALink && <CopyButton text={r.sessionALink} label="Copy link" />}</td>
                  <td className="py-1.5">
                    <WithdrawButton participantId={r.id} code={r.code} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {counts.withdrawn > 0 && (
          <div className="mt-4 text-sm">
            <h3 className="font-semibold">Withdrawn</h3>
            <ul className="mt-1 flex flex-col gap-1">
              {rows
                .filter((r) => r.status === "withdrawn")
                .map((r) => (
                  <li key={r.id} className="flex items-center gap-3">
                    <span className="font-mono">{r.code}</span>
                    <span className="text-[#566070]">{r.withdrawnReason}</span>
                    <ReinstateButton participantId={r.id} />
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <section className={box}>
        <h2 className="font-bold">Freeze models &amp; generate plans</h2>
        <p className="mt-1 text-sm text-[#566070]">Builds every participant&apos;s global and cluster models from everyone else, computes their four plans and makes Session B ready to start. Once any Session B has started, the models stay frozen.</p>
        <FreezePanel
          ready={readiness.ready}
          included={readiness.included.length}
          simulated={readiness.simulatedIncluded}
          attentionFailed={readiness.attentionFailed.map((r) => r.code)}
          withdrawn={readiness.withdrawn.map((r) => `${r.code}: ${r.withdrawnReason ?? ""}`)}
          version={frozen?.version ?? null}
          testMode={tools}
        />
        {readiness.sessionBStarted && !readiness.unfreezeActive && <UnfreezePanel phrase={ACTIVE_FREEZE_PHRASE} />}
      </section>

      {frozen && (
        <section className={box}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold">Results: frozen model version {frozen.version}</h2>
            <a href="/api/admin/phase3/downloads?what=plans" className="rounded-md border border-[#d5dbe3] px-3 py-1.5 text-sm font-medium hover:bg-[#f0f2f5]">
              Download all computed plans
            </a>
            <a href="/api/admin/phase3/downloads?what=model" className="rounded-md border border-[#d5dbe3] px-3 py-1.5 text-sm font-medium hover:bg-[#f0f2f5]">
              Download frozen model
            </a>
          </div>
          <p className="mt-2 text-sm text-[#566070]">
            Frozen {frozen.createdAt.toLocaleString()} · {results.length} participants · computed in {((frozen.computeMs ?? 0) / 1000).toFixed(1)} s · {frozen.pool ? `${(frozen.pool as unknown as { clusterWeights: unknown[] }).clusterWeights.length} cluster(s)` : ""} · app {frozen.appVersion?.slice(0, 10)} · data hash <code>{frozen.inputHash.slice(0, 12)}</code>
          </p>
          {frozen.compromised && <p className="mt-2 rounded-md bg-[#fbe9e5] px-3 py-2 text-sm font-bold text-[#7d2a1c]">COMPROMISED: the freeze was broken after a Session B had started. This is recorded in the export.</p>}
          {warnings.map((w) => (
            <p key={w} className="mt-2 rounded-md bg-[#fdf3dc] px-3 py-2 text-sm text-[#7a5a10]">
              {w}
            </p>
          ))}
          {excluded.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-[#566070]">
              {excluded.map((e) => (
                <li key={e.code}>
                  <span className="font-mono">{e.code}</span>: {e.reason}
                </li>
              ))}
            </ul>
          )}
          {truthRows.length > 0 && (
            <p className="mt-2 text-sm text-[#566070]">
              Test mode: matched each simulated person&apos;s true best config: personalFull {share("personalFull")}%, cluster5 {share("cluster5")}%, global {share("global")}%.
            </p>
          )}
          {late.length > 0 && (
            <div className="mt-4 rounded-md border border-[#f0d9a8] bg-[#fdf9ef] p-3 text-sm">
              <h3 className="font-semibold">Session A completed after freeze</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {late.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3">
                    <span className="font-mono">{r.code}</span>
                    <LatePlanActions participantId={r.id} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm" data-testid="plan-results">
              <thead>
                <tr className="text-left text-xs uppercase text-[#566070]">
                  <th className="py-1 pr-3">Participant</th>
                  <th className="py-1 pr-3">Cluster</th>
                  <th className="py-1 pr-3">Global</th>
                  <th className="py-1 pr-3">Cluster5</th>
                  <th className="py-1 pr-3">PersonalFull</th>
                  <th className="py-1 pr-3">Flags</th>
                  <th className="py-1">Session B</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const row = rows.find((x) => x.code === r.code);
                  return (
                    <tr key={r.code} className="border-t border-[#eef1f4] align-top" data-testid="plan-row">
                      <td className="py-2 pr-3 font-mono">
                        <Link className="underline" href={`/admin/p/${r.code}`}>
                          {r.code}
                        </Link>
                      </td>
                      <td className="py-2 pr-3">
                        {r.assignedCluster + 1} of {r.clusterCount}
                      </td>
                      <td className="py-2 pr-3">
                        <Thumb id={r.targets.global} />
                      </td>
                      <td className="py-2 pr-3">
                        <Thumb id={r.targets.cluster5} />
                      </td>
                      <td className="py-2 pr-3">
                        <Thumb id={r.targets.personalFull} />
                      </td>
                      <td className="max-w-56 py-2 pr-3 text-xs text-[#566070]">{flagsOf(r).join(" · ") || "none"}</td>
                      <td className="py-2 text-xs">
                        <Link className="underline" href={`/admin/p/${r.code}`}>
                          {row?.sessionBStatus === "completed" ? "Completed" : row?.sessionBUnlocked ? "Started" : "Ready: open page"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tools && (
        <section className={box} id="test-tools">
          <h2 className="font-bold">Test tools</h2>
          <h3 className="mt-3 text-sm font-semibold">Run the whole rehearsal</h3>
          <ol className="mt-1 list-decimal pl-5 text-sm text-[#566070]">
            <li>Create 31 simulated participants below.</li>
            <li>
              Do Session A yourself as one real test participant: create a Phase 3 participant on the <Link className="underline" href="/admin?phase=3">Participants</Link> page and open their Session A link.
            </li>
            <li>Simulate Session A for the simulated participants below.</li>
            <li>Freeze &amp; generate above.</li>
            <li>Do your own Session B from your participant&apos;s page.</li>
            <li>Optionally simulate Session B for the rest below.</li>
            <li>
              Download the export from the <Link className="underline" href="/admin/export">Export</Link> page, with &quot;Include simulated participants&quot; ticked.
            </li>
            <li>
              Run <code>hci phase2</code> and <code>hci phase3</code> on it (see <code>analysis/README.md</code>).
            </li>
          </ol>
          <TestTools participants={simRows.map((r) => ({ id: r.id, code: r.code, sessionA: r.sessionALabel, sessionBStatus: r.sessionBStatus, plans: r.plansCount, withdrawn: r.status === "withdrawn" }))} />
        </section>
      )}
    </div>
  );
}
