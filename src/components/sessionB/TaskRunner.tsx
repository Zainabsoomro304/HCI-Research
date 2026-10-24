"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CartApi, CartLine } from "@/components/shop/context";
import { Shop } from "@/components/shop/Shop";
import { formatPrice } from "@/config/shop";
import { DEFAULT_CONFIG, DEFAULT_CONFIG_ID, fromConfigId, toConfigId } from "@/config/uiSpace";
import type { EventSink } from "@/lib/eventLogger";
import type { EventType } from "@/lib/events";
import { stepsDue } from "@/lib/plans";
import type { BlockView } from "@/lib/session/sessionBTypes";
import { useT } from "../participant/ui";

export interface TaskFinish {
  blockIndex: number;
  cart: CartLine[];
  firstInteractionAt: number | null;
  finalConfigId: string;
  appliedConfigs: { step: number; configId: string; atMs: number }[];
  clientTs: number;
}

function TaskPanel({ block, cart, onFinish, saving }: { block: BlockView; cart: CartApi; onFinish: () => void; saving: boolean }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const remaining = block.task.budget - cart.total;
  const over = remaining < 0;
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 text-fg shadow-card">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-caption font-semibold uppercase tracking-wider text-muted">{t("task.title")}</span>
          {block.isPractice && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-caption font-semibold text-on-accent-soft">{t("sb.practiceBadge")}</span>}
        </div>
        <h2 className="mt-1 text-title font-bold leading-snug">{block.task.title}</h2>
      </div>
      <div>
        <h3 className="text-small font-semibold text-muted">{t("task.shoppingList")}</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {block.task.requiredItems.map((i) => (
            <li key={i.id} className="flex gap-2 text-small leading-snug">
              <span aria-hidden className="mt-[0.45em] size-1.5 shrink-0 rounded-full bg-accent" />
              {i.description}
            </li>
          ))}
        </ul>
      </div>
      <dl className="flex flex-col gap-1.5 border-t border-line pt-3 text-small">
        <div className="flex justify-between">
          <dt className="text-muted">{t("task.budget")}</dt>
          <dd className="font-semibold tabular-nums">{formatPrice(block.task.budget)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{t("task.spent")}</dt>
          <dd className="font-semibold tabular-nums">{formatPrice(cart.total)}</dd>
        </div>
        <div className={`-mx-2 flex justify-between rounded-md px-2 py-1 ${over ? "bg-warning-soft text-warning" : ""}`} aria-live="polite">
          <dt className={over ? "font-semibold" : "text-muted"}>{over ? t("task.overBudget", { amount: formatPrice(-remaining) }) : t("task.remaining")}</dt>
          <dd className="font-bold tabular-nums">{over ? `−${formatPrice(-remaining)}` : formatPrice(remaining)}</dd>
        </div>
      </dl>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg bg-accent px-4 py-2.5 text-body font-semibold text-on-accent transition-colors hover:bg-accent-hover"
        >
          {t("task.finish")}
        </button>
      ) : (
        <div role="alertdialog" aria-label={t("task.confirmTitle")} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-hover p-3">
          <p className="text-small font-semibold">{t("task.confirmTitle")}</p>
          <p className="text-caption text-muted">{t("task.confirmBody")}</p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onFinish}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-small font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {t("task.confirmYes")}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-small font-semibold hover:bg-surface-hover">
              {t("task.confirmNo")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Runs one shopping task: the shop starts in the default config, and the block's adaptation plan steps are
 * applied at their trigger times (afterMs since task start / afterEvents deliberate events since the last step).
 */
export function TaskRunner({ block, sink, saving, onFinish }: { block: BlockView; sink: EventSink; saving: boolean; onFinish: (f: TaskFinish) => Promise<boolean> }) {
  const resume = block.resume;
  const [applied, setApplied] = useState(resume?.appliedSteps ?? 0);
  const appliedRef = useRef(applied);
  const eventsSince = useRef(resume?.eventsSinceLast ?? 0);
  const startPerf = useRef(performance.now() - (block.elapsedMs ?? 0));
  const appliedConfigs = useRef(resume?.appliedConfigs ?? []);
  const firstInteraction = useRef<number | null>(resume?.firstInteractionAt ?? null);
  const cartRef = useRef<CartLine[]>(resume?.cart ?? []);
  const finished = useRef(false);

  const configId = applied > 0 ? block.steps[applied - 1]!.config : DEFAULT_CONFIG_ID;
  const config = useMemo(() => (configId === DEFAULT_CONFIG_ID ? DEFAULT_CONFIG : fromConfigId(configId)), [configId]);

  useEffect(() => {
    sink.setContext({ trialId: block.blockId, practice: block.isPractice, configId: toConfigId(config) });
    if (!resume) sink.log("task_start", { blockIndex: block.blockIndex, number: block.number });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.blockId]);

  const check = useCallback(() => {
    const elapsed = performance.now() - startPerf.current;
    const n = stepsDue(block.steps, appliedRef.current, elapsed, eventsSince.current);
    if (n > appliedRef.current) {
      for (let i = appliedRef.current; i < n; i++) appliedConfigs.current.push({ step: i + 1, configId: block.steps[i]!.config, atMs: Math.round(elapsed) });
      appliedRef.current = n;
      eventsSince.current = 0;
      setApplied(n);
    }
  }, [block.steps]);

  useEffect(() => {
    if (block.steps.length === 0) return;
    check();
    const id = setInterval(check, 200);
    return () => clearInterval(id);
  }, [block.steps, check]);

  const onDeliberateEvent = useCallback(
    (_type: EventType) => {
      eventsSince.current++;
      check();
    },
    [check],
  );

  const finish = async () => {
    if (finished.current) return;
    finished.current = true;
    sink.log("task_finish", { blockIndex: block.blockIndex, cartItems: cartRef.current.length });
    await sink.flush();
    const ok = await onFinish({
      blockIndex: block.blockIndex,
      cart: cartRef.current,
      firstInteractionAt: firstInteraction.current,
      finalConfigId: configId,
      appliedConfigs: appliedConfigs.current,
      clientTs: Date.now(),
    });
    if (!ok) finished.current = false;
  };

  return (
    <Shop
      config={config}
      mode={block.isPractice ? "practice" : "task"}
      sink={sink}
      initialCart={resume?.cart}
      onCartChange={(lines) => (cartRef.current = lines)}
      onDeliberateEvent={onDeliberateEvent}
      onFirstInteraction={(ts) => (firstInteraction.current ??= ts)}
      adaptationMeta={() => ({ stepIndex: appliedRef.current, atMs: Math.round(performance.now() - startPerf.current) })}
      renderTaskPanel={(cart) => <TaskPanel block={block} cart={cart} onFinish={() => void finish()} saving={saving} />}
    />
  );
}
