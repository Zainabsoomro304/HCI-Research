"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/lib/useHydrated";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="rounded border border-[#d5dbe3] bg-white px-2 py-0.5 text-xs font-medium hover:bg-[#f0f2f5]"
      title={text}
    >
      {done ? "Copied ✓" : label}
    </button>
  );
}

export function LogoutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/admin/login", { method: "DELETE" });
        location.href = "/admin/login";
      }}
      className="rounded-md px-3 py-1.5 text-sm text-[#566070] hover:bg-[#f0f2f5]"
    >
      Log out
    </button>
  );
}

export function CreateParticipantsForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<1 | 3>(1);
  const [count, setCount] = useState(1);
  const [group, setGroup] = useState("unknown");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        const res = await fetch("/api/admin/participants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studyPhase: phase, count, group }),
        });
        const body = await res.json();
        setBusy(false);
        setMsg(res.ok ? `Created ${body.created.length}: ${body.created[0]}${body.created.length > 1 ? ` … ${body.created.at(-1)}` : ""}` : body.error);
        router.refresh();
      }}
    >
      <label className="flex flex-col text-xs font-medium text-[#566070]">
        Phase
        <select value={phase} onChange={(e) => setPhase(Number(e.target.value) as 1 | 3)} className="mt-1 rounded-md border border-[#d5dbe3] px-2 py-1.5 text-sm text-[#1c2430]">
          <option value={1}>Phase 1</option>
          <option value={3}>Phase 3</option>
        </select>
      </label>
      <label className="flex flex-col text-xs font-medium text-[#566070]">
        How many
        <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-1 w-20 rounded-md border border-[#d5dbe3] px-2 py-1.5 text-sm text-[#1c2430]" />
      </label>
      <label className="flex flex-col text-xs font-medium text-[#566070]">
        Group
        <select value={group} onChange={(e) => setGroup(e.target.value)} className="mt-1 rounded-md border border-[#d5dbe3] px-2 py-1.5 text-sm text-[#1c2430]">
          <option value="unknown">Unknown (from questionnaire)</option>
          <option value="cs">CS</option>
          <option value="nonCs">Non-CS</option>
        </select>
      </label>
      <button disabled={busy || !hydrated} className="rounded-md bg-[#2b6a5a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#235a4c] disabled:opacity-60">
        {busy ? "Creating…" : "Create participants"}
      </button>
      {msg && <span className="text-sm text-[#566070]">{msg}</span>}
    </form>
  );
}
