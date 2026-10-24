"use client";

import { EVENT_FLUSH_INTERVAL_MS } from "@/config/study";
import type { ClientEvent, EventType } from "./events";

export interface LogContext {
  configId?: string | null;
  trialId?: string | null;
  practice?: boolean;
}

export interface EventSink {
  log(type: EventType, payload?: Record<string, unknown>): void;
  /** Update the context (current config / trial) attached to subsequent events. */
  setContext(ctx: Partial<LogContext>): void;
  flush(): Promise<void>;
}

const BEACON_MAX_BYTES = 60_000;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Batches events client-side and sends them to /api/events every 2 s and on pagehide (sendBeacon).
 * Unconfirmed events are mirrored to localStorage so they survive a closed tab and are re-sent on the
 * next load; the server deduplicates by event ID, so re-sending is always safe.
 */
export class EventLogger implements EventSink {
  private queue: ClientEvent[] = [];
  private inflight = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private ctx: LogContext = {};
  private readonly storageKey: string;
  private listeners: (() => void)[] = [];
  private failures = 0;
  onStatus?: (s: { pending: number; failing: boolean }) => void;

  constructor(
    private readonly token: string,
    private readonly endpoint = "/api/events",
  ) {
    this.storageKey = `evq:${token}`;
    this.restore();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), EVENT_FLUSH_INTERVAL_MS);
    const onHide = () => this.beacon();
    const onVis = () => {
      this.log("visibility_change", { state: document.visibilityState });
      if (document.visibilityState === "hidden") this.beacon();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    this.listeners.push(
      () => window.removeEventListener("pagehide", onHide),
      () => document.removeEventListener("visibilitychange", onVis),
    );
    void this.flush();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.forEach((f) => f());
    this.listeners = [];
    this.beacon();
  }

  setContext(ctx: Partial<LogContext>): void {
    this.ctx = { ...this.ctx, ...ctx };
  }

  log(type: EventType, payload?: Record<string, unknown>): void {
    this.queue.push({
      id: uuid(),
      type,
      ts: Date.now(),
      configId: this.ctx.configId ?? null,
      trialId: this.ctx.trialId ?? null,
      practice: this.ctx.practice ?? false,
      payload,
    });
    this.persist();
  }

  async flush(): Promise<void> {
    if (this.inflight || this.queue.length === 0) return;
    this.inflight = true;
    const batch = this.queue.slice(0, 200);
    try {
      const res = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: this.token, events: batch }),
        keepalive: true,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const sent = new Set(batch.map((e) => e.id));
      this.queue = this.queue.filter((e) => !sent.has(e.id));
      this.persist();
      this.failures = 0;
    } catch {
      this.failures++;
    } finally {
      this.inflight = false;
      this.onStatus?.({ pending: this.queue.length, failing: this.failures > 1 });
    }
  }

  /** Fire-and-forget send of everything pending (on tab hide/close). Events stay queued until a fetch confirms them. */
  private beacon(): void {
    if (this.queue.length === 0 || typeof navigator === "undefined" || !navigator.sendBeacon) return;
    let chunk: ClientEvent[] = [];
    const send = () => {
      if (!chunk.length) return;
      const body = new Blob([JSON.stringify({ token: this.token, events: chunk })], { type: "application/json" });
      navigator.sendBeacon(this.endpoint, body);
      chunk = [];
    };
    let size = 0;
    for (const e of this.queue) {
      const s = JSON.stringify(e).length;
      if (size + s > BEACON_MAX_BYTES || chunk.length >= 500) {
        send();
        size = 0;
      }
      chunk.push(e);
      size += s;
    }
    send();
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch {
      // storage unavailable: in-memory queue still flushes
    }
  }

  private restore(): void {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(this.storageKey) : null;
      if (raw) this.queue = JSON.parse(raw) as ClientEvent[];
    } catch {
      this.queue = [];
    }
  }
}

/** A sink that only records to the console; used in preview and clip modes (no participant). */
export class NullEventSink implements EventSink {
  constructor(private readonly verbose = false) {}
  log(type: EventType, payload?: Record<string, unknown>): void {
    if (this.verbose) console.debug("[event]", type, payload ?? {});
  }
  setContext(): void {}
  async flush(): Promise<void> {}
}
