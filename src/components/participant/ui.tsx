"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MIN_VIEWPORT_WIDTH } from "@/config/study";
import { makeT, type Translate } from "@/lib/strings";

export const TContext = createContext<Translate>(makeT("en"));
export const useT = () => useContext(TContext);

export function StudyPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-screen bg-[var(--c-bg)] px-6 py-10 text-[var(--c-fg)]">
      <div className={`mx-auto ${wide ? "max-w-5xl" : "max-w-2xl"}`}>{children}</div>
    </main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[var(--c-border)] bg-[var(--c-surface)] p-8 shadow-sm ${className}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  className = "",
  ariaKeyshortcuts,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  type?: "button" | "submit";
  className?: string;
  ariaKeyshortcuts?: string;
}) {
  const styles =
    variant === "primary"
      ? "bg-[var(--c-accent)] text-[var(--c-on-accent)] hover:bg-[var(--c-accent-hover)] disabled:bg-[#e3e7ec] disabled:text-[#4e5763]"
      : "border border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-fg)] hover:bg-[var(--c-surface-hover)] disabled:text-[#8a929e]";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={ariaKeyshortcuts}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[16px] font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** Minimal Markdown renderer for consent text: headings, paragraphs, lists, **bold**, *italic*, links. */
export function Markdown({ text }: { text: string }) {
  const inline = (s: string, key: string) => {
    const parts: ReactNode[] = [];
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) parts.push(<strong key={`${key}-${i++}`}>{tok.slice(2, -2)}</strong>);
      else if (tok.startsWith("*")) parts.push(<em key={`${key}-${i++}`}>{tok.slice(1, -1)}</em>);
      else {
        const [, label, href] = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
        parts.push(
          <a key={`${key}-${i++}`} href={href} target="_blank" rel="noreferrer" className="text-[var(--c-accent)] underline">
            {label}
          </a>,
        );
      }
      last = m.index + tok.length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  };
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-3 text-[16px] leading-relaxed">
      {blocks.map((b, bi) => {
        const t = b.trim();
        if (!t) return null;
        const h = t.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
          const level = h[1]!.length;
          const cls = level === 1 ? "text-[24px] font-bold" : level === 2 ? "mt-2 text-[19px] font-semibold" : "text-[17px] font-semibold";
          return (
            <p key={bi} role="heading" aria-level={level} className={cls}>
              {inline(h[2]!, `h${bi}`)}
            </p>
          );
        }
        const lines = t.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return (
            <ul key={bi} className="list-disc pl-6">
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""), `l${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        return <p key={bi}>{inline(lines.join(" "), `p${bi}`)}</p>;
      })}
    </div>
  );
}

/** Blocks participant pages on viewports narrower than MIN_VIEWPORT_WIDTH. */
export function DesktopGate({ children }: { children: ReactNode }) {
  const t = useT();
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < MIN_VIEWPORT_WIDTH);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  if (narrow)
    return (
      <StudyPage>
        <Card>
          <h1 className="text-[22px] font-bold">{t("common.desktopOnly.title")}</h1>
          <p className="mt-3 text-[16px] text-[var(--c-muted)]">{t("common.desktopOnly.body")}</p>
        </Card>
      </StudyPage>
    );
  return <>{children}</>;
}

/** Fixed banner shown while an action is being saved or retried. */
export function SavingBanner({ status }: { status: "idle" | "saving" | "retrying" }) {
  const t = useT();
  if (status === "idle") return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 flex justify-center p-3">
      <div
        className={`rounded-full px-4 py-2 text-[14px] font-semibold shadow-lg ${
          status === "retrying" ? "bg-[var(--c-warning-soft)] text-[var(--c-warning)]" : "bg-[var(--c-fg)] text-white"
        }`}
      >
        {status === "retrying" ? t("common.retrying") : t("common.saving")}
      </div>
    </div>
  );
}
