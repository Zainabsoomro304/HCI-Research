"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/lib/useHydrated";

interface Props {
  id: string;
  code: string;
  studyPhase: number;
  group: string;
  language: string;
  languages: string[];
  seed: number;
  seedLocked: boolean;
  notes: string;
  conditionRowOverride: number | null;
  taskRowOverride: number | null;
  derivedRows: { conditionRow: number; taskRow: number };
  latinLocked: boolean;
}

const input = "mt-1 rounded-md border border-[#d5dbe3] px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-[#f0f2f5] disabled:text-[#8a929e]";

export function ParticipantEditForm(p: Props) {
  const router = useRouter();
  const [group, setGroup] = useState(p.group);
  const [language, setLanguage] = useState(p.language);
  const [seed, setSeed] = useState(String(p.seed));
  const [notes, setNotes] = useState(p.notes);
  const [cRow, setCRow] = useState(p.conditionRowOverride === null ? "" : String(p.conditionRowOverride));
  const [tRow, setTRow] = useState(p.taskRowOverride === null ? "" : String(p.taskRowOverride));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hydrated = useHydrated();
  return (
    <form
      className="grid grid-cols-2 gap-4 md:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg(null);
        const body: Record<string, unknown> = { group, language, notes: notes || null };
        if (!p.seedLocked) body.seed = Number(seed);
        if (p.studyPhase === 3 && !p.latinLocked) {
          body.conditionRowOverride = cRow === "" ? null : Number(cRow);
          body.taskRowOverride = tRow === "" ? null : Number(tRow);
        }
        const res = await fetch(`/api/admin/participants/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const r = await res.json();
        setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
        router.refresh();
      }}
    >
      <label className="flex flex-col text-xs font-medium text-[#566070]">
        Group
        <select value={group} onChange={(e) => setGroup(e.target.value)} className={input}>
          <option value="unknown">unknown</option>
          <option value="cs">cs</option>
          <option value="nonCs">nonCs</option>
        </select>
      </label>
      <label className="flex flex-col text-xs font-medium text-[#566070]">
        Language
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className={input}>
          {p.languages.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs font-medium text-[#566070]">
        Seed {p.seedLocked && <span className="font-normal">(locked: schedule generated)</span>}
        <input value={seed} onChange={(e) => setSeed(e.target.value.replace(/\D/g, ""))} disabled={p.seedLocked} className={`${input} font-mono disabled:bg-[#f0f2f5]`} />
      </label>
      {p.studyPhase === 3 && (
        <>
          <label className="flex flex-col text-xs font-medium text-[#566070]">
            Condition square row (default {p.derivedRows.conditionRow})
            <select value={cRow} onChange={(e) => setCRow(e.target.value)} disabled={p.latinLocked} className={input}>
              <option value="">auto ({p.derivedRows.conditionRow})</option>
              {[0, 1, 2, 3].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium text-[#566070]">
            Task square row (default {p.derivedRows.taskRow})
            <select value={tRow} onChange={(e) => setTRow(e.target.value)} disabled={p.latinLocked} className={input}>
              <option value="">auto ({p.derivedRows.taskRow})</option>
              {[0, 1, 2, 3].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label className="col-span-full flex flex-col text-xs font-medium text-[#566070]">
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={input} />
      </label>
      <div className="col-span-full flex items-center gap-3">
        <button disabled={!hydrated} className="rounded-md bg-[#2b6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#235a4c] disabled:opacity-60">
          Save
        </button>
        {msg && <span className={`text-sm ${msg.ok ? "text-[#1d4d41]" : "text-[#b03a27]"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function PlanUpload({ participantId }: { participantId: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<string[] | null>(null);
  const [ok, setOk] = useState(false);
  return (
    <div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[#d5dbe3] bg-white px-3 py-2 text-sm font-medium hover:bg-[#f0f2f5]">
        Upload plan JSON…
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setErrors(null);
            setOk(false);
            const res = await fetch(`/api/admin/participants/${participantId}/plan`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fileName: file.name, content: await file.text() }),
            });
            const body = await res.json();
            if (res.ok) {
              setOk(true);
              router.refresh();
            } else setErrors(body.errors ?? [body.error]);
            e.target.value = "";
          }}
        />
      </label>
      {ok && <p className="mt-2 text-sm text-[#1d4d41]">Plan uploaded and validated.</p>}
      {errors && (
        <div className="mt-3 rounded-md border border-[#f0c7bd] bg-[#fbe9e5] p-3 text-sm text-[#7d2a1c]">
          <p className="font-semibold">The plan was not saved:</p>
          <ul className="mt-1 list-disc pl-5 font-mono text-xs">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function UnlockButton({
  sessionId,
  link,
  unlocked,
  ready,
  sessionACompleted,
}: {
  sessionId: string;
  link: string;
  unlocked: boolean;
  ready: boolean;
  sessionACompleted: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (unlocked)
    return (
      <a href={link} target="_blank" rel="noreferrer" className="inline-block rounded-md bg-[#2b6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#235a4c]">
        Open Session B ↗
      </a>
    );
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={!ready}
        onClick={async () => {
          setError(null);
          const res = await fetch(`/api/admin/sessions/${sessionId}/unlock`, { method: "POST" });
          if (!res.ok) return setError((await res.json()).error);
          router.refresh();
          window.open(link, "_blank");
        }}
        className="rounded-md bg-[#2b6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#235a4c] disabled:cursor-not-allowed disabled:bg-[#c8ced6]"
      >
        Start Session B
      </button>
      {!ready && <span className="text-sm text-[#566070]">Upload all 4 adaptation plans first.</span>}
      {ready && !sessionACompleted && <span className="text-sm text-[#7a5a10]">Note: Session A is not completed yet.</span>}
      {error && <span className="text-sm text-[#b03a27]">{error}</span>}
    </div>
  );
}
