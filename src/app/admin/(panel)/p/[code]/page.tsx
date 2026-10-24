import Link from "next/link";
import { notFound } from "next/navigation";
import { ParticipantEditForm, PlanUpload, UnlockButton } from "@/components/admin/ParticipantDetail";
import { CopyButton } from "@/components/admin/widgets";
import { CONDITIONS } from "@/config/study";
import { DEFAULT_CONFIG_ID } from "@/config/uiSpace";
import { participantOverview } from "@/lib/admin/overview";
import { prisma } from "@/lib/db";
import { latinRows } from "@/lib/latinSquare";
import type { PlanStep } from "@/lib/plans";
import { LANGUAGES } from "@/lib/strings";

export const dynamic = "force-dynamic";

function Thumb({ configId, caption }: { configId: string; caption: string }) {
  return (
    <figure className="w-44 shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/stills/${configId}.png`} alt={configId} className="aspect-[16/10] w-full rounded-md border border-[#dfe3e8] object-cover" />
      <figcaption className="mt-1 text-[11px] leading-tight text-[#566070]">
        {caption}
        <br />
        <code className="text-[#1c2430]">{configId}</code>
      </figcaption>
    </figure>
  );
}

export default async function ParticipantPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [summary] = await participantOverview({ code });
  if (!summary) notFound();
  const p = summary.participant;
  const plans = await prisma.adaptationPlan.findMany({ where: { participantId: p.id } });
  const blocks = await prisma.taskBlock.findMany({ where: { participantId: p.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
  const sessionB = summary.sessions.find((s) => s.type === "p3_sessionB");
  const derived = latinRows(p.number);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm text-[#566070] hover:underline">
          ← Participants
        </Link>
        <h1 className="font-mono text-2xl font-bold">{p.code}</h1>
        <span className="rounded-full bg-[#eef1f4] px-2 py-0.5 text-xs">Phase {p.studyPhase}</span>
      </div>

      <section className="rounded-xl border border-[#dfe3e8] bg-white p-5">
        <h2 className="mb-3 font-bold">Sessions</h2>
        <table className="w-full text-sm">
          <tbody>
            {summary.sessions.map((s) => (
              <tr key={s.id} className="border-t border-[#eef1f4]">
                <td className="py-2 pr-4 font-medium">{s.type}</td>
                <td className="py-2 pr-4">{s.label}</td>
                <td className="py-2 pr-4 text-xs text-[#566070]">{s.startedAt ? `started ${s.startedAt.toLocaleString()}` : ""}</td>
                <td className="py-2 pr-4 font-mono text-xs text-[#566070]">{s.appVersion?.slice(0, 10)}</td>
                <td className="py-2">
                  <span className="mr-2 font-mono text-xs">{s.link}</span>
                  <CopyButton text={s.link} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm text-[#566070]">
          Attention checks: {summary.quality.attentionCorrect}/{summary.quality.attentionAnswered} correct{summary.quality.attentionFailed ? " – FAILED" : ""} · Self-consistency:{" "}
          {summary.quality.consistencyPct ?? "–"}
          {summary.quality.consistencyPct !== null ? "%" : ""} ({summary.quality.repeatsConsistent}/{summary.quality.repeatsAnswered} repeats)
        </p>
      </section>

      <section className="rounded-xl border border-[#dfe3e8] bg-white p-5">
        <h2 className="mb-3 font-bold">Settings</h2>
        <ParticipantEditForm
          id={p.id}
          code={p.code}
          studyPhase={p.studyPhase}
          group={p.group}
          language={p.language}
          languages={LANGUAGES}
          seed={p.seed}
          seedLocked={summary.scheduleGenerated}
          notes={p.notes ?? ""}
          conditionRowOverride={p.conditionRowOverride}
          taskRowOverride={p.taskRowOverride}
          derivedRows={derived}
          latinLocked={!!sessionB?.unlocked}
        />
      </section>

      {p.studyPhase === 3 && sessionB && (
        <section className="rounded-xl border border-[#dfe3e8] bg-white p-5">
          <h2 className="font-bold">Adaptation plans &amp; Session B</h2>
          <p className="mt-1 text-sm text-[#566070]">
            Upload one JSON file with all four conditions. Uploading again replaces the plans; a started Session B keeps the snapshot it started with.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-6">
            <PlanUpload participantId={p.id} />
            <UnlockButton
              sessionId={sessionB.id}
              link={sessionB.link}
              unlocked={sessionB.unlocked}
              ready={plans.length === CONDITIONS.length}
              sessionACompleted={summary.sessions.some((s) => s.type === "p3_sessionA" && s.status === "completed")}
            />
          </div>
          <div className="mt-5 flex flex-col gap-5">
            {CONDITIONS.map((c) => {
              const plan = plans.find((x) => x.condition === c);
              const steps = (plan?.steps as PlanStep[] | undefined) ?? [];
              const block = blocks.find((b) => b.condition === c);
              return (
                <div key={c}>
                  <h3 className="text-sm font-semibold">
                    {c}{" "}
                    <span className="font-normal text-[#566070]">
                      {plan ? `– ${steps.length} step(s), uploaded ${plan.uploadedAt.toLocaleString()}${plan.sourceFileName ? ` from ${plan.sourceFileName}` : ""}` : "– not uploaded"}
                      {block ? ` · block ${block.blockIndex + 1}, task ${block.taskId}` : ""}
                    </span>
                  </h3>
                  {plan && (
                    <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
                      <Thumb configId={DEFAULT_CONFIG_ID} caption="start" />
                      {steps.map((s, i) => (
                        <Thumb key={i} configId={s.config} caption={`step ${i + 1}: ${s.trigger.type} ${s.trigger.value}`} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
