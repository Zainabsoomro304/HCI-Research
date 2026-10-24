"use client";

import { useCallback, useRef, useState } from "react";
import type { ParticipantState } from "@/lib/session/types";

export type SaveStatus = "idle" | "saving" | "retrying";

/**
 * Sends participant actions to the server. Network errors and 5xx responses are retried indefinitely with
 * backoff (visible "Retrying" banner); the UI only advances once the server confirms the save.
 */
export function useSessionActions(token: string, initial: ParticipantState) {
  const [state, setState] = useState<ParticipantState>(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [fatal, setFatal] = useState<string | null>(null);
  const busy = useRef(false);

  const act = useCallback(
    async (action: Record<string, unknown>): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setStatus("saving");
      let delay = 1000;
      try {
        for (;;) {
          try {
            const res = await fetch(`/api/s/${token}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(action),
            });
            const body = (await res.json().catch(() => ({}))) as { state?: ParticipantState; error?: string };
            if (res.ok && body.state) {
              setState(body.state);
              return true;
            }
            if (res.status >= 400 && res.status < 500) {
              // Out of sync (e.g. another tab advanced): adopt the server state rather than failing.
              if (body.state) {
                setState(body.state);
                return false;
              }
              setFatal(body.error ?? `Error ${res.status}`);
              return false;
            }
            throw new Error(`HTTP ${res.status}`);
          } catch {
            setStatus("retrying");
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(delay * 2, 8000);
          }
        }
      } finally {
        busy.current = false;
        setStatus("idle");
      }
    },
    [token],
  );

  return { state, act, status, fatal };
}
