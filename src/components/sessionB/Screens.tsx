"use client";

import { useState } from "react";
import { formatPrice } from "@/config/shop";
import type { InstrumentItem } from "@/lib/questionnaire/instruments";
import type { BlockView } from "@/lib/session/sessionBTypes";
import { Button, Card, StudyPage, useT } from "../participant/ui";

export function WelcomeScreen({ onStart }: { onStart: () => void }) {
  const t = useT();
  return (
    <StudyPage>
      <Card>
        <h1 className="text-[24px] font-bold">{t("sb.welcome.title")}</h1>
        <div className="mt-4 flex flex-col gap-3 text-[17px] leading-relaxed">
          <p>{t("sb.welcome.p1")}</p>
          <p>{t("sb.welcome.p2")}</p>
          <p>{t("sb.welcome.p3")}</p>
          <p className="font-semibold">{t("sb.welcome.p4")}</p>
        </div>
        <div className="mt-8 flex justify-end">
          <Button onClick={onStart}>{t("sb.welcome.start")}</Button>
        </div>
      </Card>
    </StudyPage>
  );
}

export function BlockIntro({ block, total, onStart }: { block: BlockView; total: number; onStart: () => void }) {
  const t = useT();
  return (
    <StudyPage>
      <Card>
        <p className="text-[14px] font-semibold uppercase tracking-wider text-[var(--c-muted)]">{t("sb.intro.taskOf", { number: block.number, total })}</p>
        <h1 className="mt-1 text-[26px] font-bold">{block.task.title}</h1>
        <p className="mt-3 text-[17px] leading-relaxed">{block.task.instructions}</p>
        <div className="mt-6 grid grid-cols-[1fr_auto] gap-6 rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-[var(--c-muted)]">{t("sb.intro.list")}</h2>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[16px]">
              {block.task.requiredItems.map((i) => (
                <li key={i.id}>{i.description}</li>
              ))}
            </ul>
          </div>
          <p className="self-start rounded-lg bg-[var(--c-accent-soft)] px-4 py-2 text-[18px] font-bold text-[var(--c-on-accent-soft)]">
            {t("sb.intro.budget", { amount: formatPrice(block.task.budget) })}
          </p>
        </div>
        <div className="mt-8 flex justify-end">
          <Button onClick={onStart}>{t("sb.intro.start")}</Button>
        </div>
      </Card>
    </StudyPage>
  );
}

type Answer = number | "NA";

/** Renders whatever the instrument JSON contains: Likert scales of any length, anchors, optional labels and N/A. */
export function QuestionnaireScreen({
  number,
  title,
  instructions,
  items,
  onSubmit,
}: {
  number: number;
  title: string;
  instructions: string;
  items: InstrumentItem[];
  onSubmit: (responses: Record<string, Answer>) => Promise<boolean>;
}) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [showMissing, setShowMissing] = useState(false);
  const missing = items.filter((i) => answers[i.id] === undefined);
  let lastSection: string | undefined;
  return (
    <StudyPage wide>
      <Card>
        <p className="text-[14px] font-semibold uppercase tracking-wider text-[var(--c-muted)]">{t("q.progress", { number })}</p>
        <h1 className="mt-1 text-[24px] font-bold">{title}</h1>
        <p className="mt-2 text-[16px] text-[var(--c-muted)]">{instructions}</p>
        <div className="mt-6 flex flex-col gap-3">
          {items.map((item) => {
            const header = item.section && item.section !== lastSection ? item.section : null;
            lastSection = item.section;
            const values = Array.from({ length: item.scale.points }, (_, k) => item.scale.min + k);
            const err = showMissing && answers[item.id] === undefined;
            return (
              <div key={item.id}>
                {header && <h2 className="mb-2 mt-4 text-[17px] font-semibold">{header}</h2>}
                <fieldset className={`rounded-xl border p-4 ${err ? "border-[var(--c-warning)] bg-[var(--c-warning-soft)]" : "border-[var(--c-border)]"}`}>
                  <legend className="sr-only">{item.text}</legend>
                  <p className="text-[16px] font-medium" aria-hidden>
                    {item.text}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="w-36 text-right text-[13px] leading-tight text-[var(--c-muted)]">{item.scale.leftAnchor}</span>
                    <div className="flex flex-1 justify-center gap-1.5">
                      {values.map((v, k) => (
                        <label key={v} className="flex flex-col items-center gap-1">
                          <input
                            type="radio"
                            name={item.id}
                            value={v}
                            checked={answers[item.id] === v}
                            onChange={() => setAnswers((a) => ({ ...a, [item.id]: v }))}
                            className="peer sr-only"
                          />
                          <span className="grid size-10 cursor-pointer place-items-center rounded-lg border border-[var(--c-border)] bg-white text-[15px] font-semibold peer-checked:border-[var(--c-accent)] peer-checked:bg-[var(--c-accent)] peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--c-focus)] hover:bg-[var(--c-surface-hover)]">
                            {v}
                          </span>
                          {item.scale.labels && <span className="max-w-16 text-center text-[11px] leading-tight text-[var(--c-muted)]">{item.scale.labels[k]}</span>}
                        </label>
                      ))}
                    </div>
                    <span className="w-36 text-[13px] leading-tight text-[var(--c-muted)]">{item.scale.rightAnchor}</span>
                    {item.allowNA && (
                      <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-[14px]">
                        <input type="radio" name={item.id} value="NA" checked={answers[item.id] === "NA"} onChange={() => setAnswers((a) => ({ ...a, [item.id]: "NA" }))} className="accent-[var(--c-accent)]" />
                        {item.naLabel}
                      </label>
                    )}
                  </div>
                </fieldset>
              </div>
            );
          })}
        </div>
        {showMissing && missing.length > 0 && <p className="mt-4 text-[15px] font-semibold text-[var(--c-warning)]">{t("q.missing", { count: missing.length })}</p>}
        <div className="mt-6 flex justify-end">
          <Button
            onClick={() => {
              if (missing.length) {
                setShowMissing(true);
                document.getElementsByName(missing[0]!.id)[0]?.closest("fieldset")?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
              }
              void onSubmit(answers);
            }}
          >
            {t("q.submit")}
          </Button>
        </div>
      </Card>
    </StudyPage>
  );
}

interface RankItem {
  blockIndex: number;
  number: number;
  imageUrl: string;
}

/** Drag-to-rank (or arrow buttons) the four interfaces, plus a one-line reason for each. */
export function RankingScreen({ interfaces, onSubmit }: { interfaces: RankItem[]; onSubmit: (ranks: { blockIndex: number; rank: number; reason: string }[]) => Promise<boolean> }) {
  const t = useT();
  const [order, setOrder] = useState<RankItem[]>(interfaces);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [dragging, setDragging] = useState<number | null>(null);
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((o) => {
      const n = o.slice();
      const [it] = n.splice(from, 1);
      n.splice(to, 0, it!);
      return n;
    });
  };
  return (
    <StudyPage wide>
      <Card>
        <h1 className="text-[24px] font-bold">{t("rank.title")}</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-[var(--c-muted)]">{t("rank.intro")}</p>
        <p className="mt-6 text-[13px] font-semibold uppercase tracking-wider text-[var(--c-accent)]">▲ {t("rank.mostPreferred")}</p>
        <ol className="mt-2 flex flex-col gap-3">
          {order.map((it, i) => {
            const name = t("rank.interface", { number: it.number });
            return (
              <li
                key={it.blockIndex}
                draggable
                onDragStart={(e) => {
                  setDragging(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging !== null) move(dragging, i);
                  setDragging(null);
                }}
                onDragEnd={() => setDragging(null)}
                data-interface={it.number}
                className={`flex items-center gap-4 rounded-xl border bg-white p-3 transition-shadow ${dragging === i ? "border-[var(--c-accent)] opacity-60" : "border-[var(--c-border)]"} cursor-grab active:cursor-grabbing`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--c-accent)] text-[17px] font-bold text-white" aria-label={t("rank.position", { rank: i + 1 })}>
                  {i + 1}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.imageUrl} alt={name} draggable={false} className="aspect-[16/10] w-48 shrink-0 rounded-lg border border-[var(--c-border)] object-cover" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="text-[17px] font-semibold">{name}</span>
                  <input
                    type="text"
                    maxLength={300}
                    value={reasons[it.blockIndex] ?? ""}
                    onChange={(e) => setReasons((r) => ({ ...r, [it.blockIndex]: e.target.value }))}
                    placeholder={t("rank.why")}
                    aria-label={`${name}: ${t("rank.why")}`}
                    className="w-full rounded-lg border border-[var(--c-border)] px-3 py-2 text-[15px]"
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={t("rank.moveUp", { name })} className="rounded-md border border-[var(--c-border)] px-3 py-1 text-[16px] hover:bg-[var(--c-surface-hover)] disabled:opacity-30">
                    ▲
                  </button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} aria-label={t("rank.moveDown", { name })} className="rounded-md border border-[var(--c-border)] px-3 py-1 text-[16px] hover:bg-[var(--c-surface-hover)] disabled:opacity-30">
                    ▼
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[13px] font-semibold uppercase tracking-wider text-[var(--c-muted)]">▼ {t("rank.leastPreferred")}</p>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => void onSubmit(order.map((it, i) => ({ blockIndex: it.blockIndex, rank: i + 1, reason: reasons[it.blockIndex] ?? "" })))}>{t("rank.submit")}</Button>
        </div>
      </Card>
    </StudyPage>
  );
}
