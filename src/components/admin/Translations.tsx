"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function MarkReviewedButton({ translationKey }: { translationKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/admin/translations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: translationKey }) });
        router.refresh();
      }}
      className="rounded border border-[#d5dbe3] bg-white px-2 py-1 text-xs font-medium hover:bg-[#f0f2f5] disabled:opacity-60"
    >
      Mark as reviewed
    </button>
  );
}
