"use client";

import { useState } from "react";
import { useHydrated } from "@/lib/useHydrated";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (!res.ok) return setError("Wrong password.");
    const next = new URLSearchParams(location.search).get("next");
    location.href = next && next.startsWith("/") ? next : "/admin";
  };
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f6f8] p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-[#dfe3e8] bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold">Researcher login</h1>
        <label className="mt-6 block text-sm font-medium text-[#566070]" htmlFor="pw">
          Password
        </label>
        <input
          id="pw"
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#dfe3e8] px-3 py-2"
        />
        {error && <p className="mt-2 text-sm text-[#b03a27]">{error}</p>}
        <button disabled={busy || !hydrated} className="mt-6 w-full rounded-lg bg-[#2b6a5a] px-4 py-2.5 font-semibold text-white hover:bg-[#235a4c] disabled:opacity-60">
          {busy ? "Checking…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
