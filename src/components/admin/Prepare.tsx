"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/lib/useHydrated";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

const primary = "rounded-md bg-[#2b6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#235a4c] disabled:cursor-not-allowed disabled:bg-[#c8ced6]";
const quiet = "rounded border border-[#d5dbe3] bg-white px-2 py-1 text-xs font-medium hover:bg-[#f0f2f5] disabled:opacity-60";
const field = "rounded-md border border-[#d5dbe3] px-2 py-1.5 text-sm";

export function FreezePanel(p: { ready: boolean; included: number; simulated: number; attentionFailed: string[]; withdrawn: string[]; version: number | null; testMode: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setConfirming(false);
    setError(null);
    try {
      let state = await post("/api/admin/prepare", { action: "freeze_start" });
      setProgress({ done: state.done, total: state.total });
      while (!state.finished) {
        state = await post("/api/admin/prepare", { action: "freeze_step", jobId: state.jobId });
        setProgress({ done: state.done, total: state.total });
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="mt-3">
      <button type="button" className={primary} disabled={!p.ready || !hydrated || !!progress} onClick={() => setConfirming(true)}>
        {p.version ? "Freeze models & generate plans again" : "Freeze models & generate plans"}
      </button>
      {progress && (
        <div className="mt-3 max-w-md" role="status">
          <div className="h-2 overflow-hidden rounded bg-[#eef1f4]">
            <div className="h-full bg-[#2b6a5a] transition-all" style={{ width: `${Math.round((100 * progress.done) / progress.total)}%` }} />
          </div>
          <p className="mt-1 text-sm text-[#566070]">
            Computing… {progress.done} of {progress.total}. Keep this page open.
          </p>
        </div>
      )}
      {error && <p className="mt-3 rounded-md bg-[#fbe9e5] px-3 py-2 text-sm text-[#7d2a1c]">{error}</p>}
      {confirming && (
        <div role="dialog" aria-modal="true" aria-label="Confirm freeze" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold">Freeze models and generate plans?</h3>
            <ul className="mt-3 list-disc pl-5 text-sm">
              <li>
                <strong>{p.included}</strong> participants are included in the models{p.testMode ? `, of which ${p.simulated} are simulated` : ""}.
              </li>
              {p.attentionFailed.length > 0 && (
                <li>
                  Left out of the models for failing an attention check: {p.attentionFailed.join(", ")}. They still get a flagged plan, built from everyone included.
                </li>
              )}
              {p.withdrawn.length > 0 && <li>Excluded as withdrawn: {p.withdrawn.join("; ")}.</li>}
              {p.withdrawn.length === 0 && p.attentionFailed.length === 0 && <li>Nobody is excluded.</li>}
            </ul>
            <p className="mt-3 rounded-md bg-[#fdf3dc] px-3 py-2 text-sm text-[#7a5a10]">The models will be frozen. They cannot be changed once any shopping session starts.</p>
            {p.version && <p className="mt-2 text-sm text-[#566070]">This replaces the computed plans from version {p.version}. Uploaded overrides are kept.</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="rounded-md border border-[#d5dbe3] px-4 py-2 text-sm font-medium hover:bg-[#f0f2f5]" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button type="button" className={primary} onClick={run}>
                Freeze and generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function UnfreezePanel({ phrase }: { phrase: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className="mt-3 block text-sm text-[#b03a27] underline" onClick={() => setOpen(true)}>
        Unfreeze (compromises the study)
      </button>
    );
  return (
    <div className="mt-4 max-w-xl rounded-md border border-[#f0c7bd] bg-[#fbe9e5] p-4 text-sm text-[#7d2a1c]">
      <p className="font-semibold">A shopping session has started. Changing the models now compromises the study, and the export will say so permanently.</p>
      <label className="mt-3 block">
        Type <code className="font-bold">{phrase}</code>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} className={`${field} mt-1 w-full bg-white`} />
      </label>
      <label className="mt-3 block">
        Reason
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={`${field} mt-1 w-full bg-white`} />
      </label>
      {error && <p className="mt-2 font-semibold">{error}</p>}
      <button
        type="button"
        className="mt-3 rounded-md bg-[#b03a27] px-4 py-2 font-semibold text-white disabled:opacity-50"
        disabled={typed !== phrase || !reason.trim()}
        onClick={async () => {
          try {
            await post("/api/admin/prepare", { action: "unfreeze", phrase: typed, reason });
            router.refresh();
            setOpen(false);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Unfreeze
      </button>
    </div>
  );
}

export function WithdrawButton({ participantId, code }: { participantId: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!open)
    return (
      <button type="button" className={quiet} onClick={() => setOpen(true)}>
        Mark as withdrawn
      </button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input aria-label={`Reason ${code} withdrew`} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
      <button
        type="button"
        className={quiet}
        disabled={!reason.trim()}
        onClick={async () => {
          try {
            await post("/api/admin/prepare", { action: "withdraw", participantId, reason });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        Confirm
      </button>
      {error && <span className="text-[#b03a27]">{error}</span>}
    </span>
  );
}

export function ReinstateButton({ participantId }: { participantId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={quiet}
      onClick={async () => {
        await post("/api/admin/prepare", { action: "reinstate", participantId });
        router.refresh();
      }}
    >
      Undo
    </button>
  );
}

export function LatePlanActions({ participantId }: { participantId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const act = async (body: unknown) => {
    setError(null);
    try {
      await post("/api/admin/prepare", body);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" className={quiet} onClick={() => act({ action: "late_plan", participantId })}>
        Generate plan from the frozen models (flagged late)
      </button>
      <button type="button" className={quiet} onClick={() => act({ action: "withdraw", participantId, reason: "Excluded: finished Session 1 after the freeze" })}>
        Exclude
      </button>
      {error && <span className="text-[#b03a27]">{error}</span>}
    </span>
  );
}

interface SimRow {
  id: string;
  code: string;
  comparison: string;
  shoppingStatus: string | null;
  plans: number;
  withdrawn: boolean;
}

export function TestTools({ participants }: { participants: SimRow[] }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [count, setCount] = useState(31);
  const [urduShare, setUrduShare] = useState(50);
  const [seed, setSeed] = useState(1);
  const [attention, setAttention] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const needA = participants.filter((p) => p.comparison !== "Completed" && !p.withdrawn);
  const needB = participants.filter((p) => p.comparison === "Completed" && p.plans === 4 && p.shoppingStatus !== "completed" && !p.withdrawn);

  const simulate = async (action: "simulate_comparison" | "simulate_shopping", list: SimRow[]) => {
    setMessage(null);
    try {
      for (const [i, p] of list.entries()) {
        setBusy(`${action === "simulate_comparison" ? "Session 1" : "Session 2"}: ${i + 1} of ${list.length} (${p.code})`);
        await post("/api/admin/test-tools", { action, participantId: p.id });
      }
      setMessage(`Done: ${list.length} simulated.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(null);
      router.refresh();
    }
  };

  return (
    <div className="mt-5 flex flex-col gap-5 text-sm">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setMessage(null);
          setBusy("Creating…");
          try {
            const r = await post("/api/admin/test-tools", { action: "create", count, urduShare: urduShare / 100, seed, attentionErrorRate: attention / 100 });
            setMessage(`Created ${r.created.length}: ${r.created[0]} … ${r.created.at(-1)}`);
          } catch (err) {
            setMessage((err as Error).message);
          } finally {
            setBusy(null);
            router.refresh();
          }
        }}
      >
        <label className="flex flex-col text-xs font-medium text-[#566070]">
          How many
          <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} className={`${field} mt-1 w-20`} />
        </label>
        <label className="flex flex-col text-xs font-medium text-[#566070]">
          Urdu share (%)
          <input type="number" min={0} max={100} value={urduShare} onChange={(e) => setUrduShare(Number(e.target.value))} className={`${field} mt-1 w-20`} />
        </label>
        <label className="flex flex-col text-xs font-medium text-[#566070]">
          Seed
          <input type="number" min={0} value={seed} onChange={(e) => setSeed(Number(e.target.value))} className={`${field} mt-1 w-24`} />
        </label>
        <label className="flex flex-col text-xs font-medium text-[#566070]">
          Attention error rate (%)
          <input type="number" min={0} max={100} value={attention} onChange={(e) => setAttention(Number(e.target.value))} className={`${field} mt-1 w-20`} />
        </label>
        <button className={primary} disabled={!hydrated || !!busy}>
          Create simulated participants
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} disabled={!hydrated || !!busy || needA.length === 0} onClick={() => simulate("simulate_comparison", needA)}>
          Simulate Session 1 ({needA.length})
        </button>
        <button type="button" className={primary} disabled={!hydrated || !!busy || needB.length === 0} onClick={() => simulate("simulate_shopping", needB)}>
          Simulate Session 2 ({needB.length})
        </button>
        <span className="text-[#566070]">{participants.length} simulated participants in total.</span>
      </div>
      {busy && (
        <p role="status" className="text-[#566070]">
          {busy}. Keep this page open.
        </p>
      )}
      {message && (
        <p role="status" className="font-medium">
          {message}
        </p>
      )}
    </div>
  );
}
