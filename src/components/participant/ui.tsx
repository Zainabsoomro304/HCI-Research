"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { dirOf, type Lang } from "@/config/shop";
import { MIN_VIEWPORT_WIDTH } from "@/config/study";
import { makeT, type Translate } from "@/lib/strings";

export const TContext = createContext<Translate>(makeT("en"));
export const useT = () => useContext(TContext);
export const LangContext = createContext<Lang>("en");
export const useLang = () => useContext(LangContext);

/**
 * Study screens never vary with the experimental settings. They are sized for readers aged 40+: body text 18 px in
 * English and 20 px in Urdu (Nastaliq, with a tall line), large high-contrast buttons, one idea per sentence.
 * Every size inside is relative (em) to this base.
 */
export const STUDY_TEXT_PX: Record<Lang, number> = { en: 18, ur: 20 };
export const STUDY_LINE_HEIGHT: Record<Lang, number> = { en: 1.55, ur: 2.1 };

export function StudyRoot({ lang, children }: { lang: Lang; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirOf(lang);
  }, [lang]);
  return (
    <LangContext.Provider value={lang}>
      <div dir={dirOf(lang)} lang={lang} className="study" style={{ fontSize: STUDY_TEXT_PX[lang], lineHeight: STUDY_LINE_HEIGHT[lang] }}>
        {children}
      </div>
    </LangContext.Provider>
  );
}

export function StudyPage({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="min-h-screen bg-[var(--c-bg)] px-[1em] py-[2em] text-[var(--c-fg)]">
      <div className={`mx-auto ${wide ? "max-w-[58em]" : "max-w-[40em]"}`}>{children}</div>
    </main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[1em] border border-[var(--c-border)] bg-[var(--c-surface)] p-[1.6em] shadow-sm ${className}`}>{children}</div>;
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
      ? "bg-[#1E6B4B] text-white hover:bg-[#185A3F] disabled:bg-[#dfe3e0] disabled:text-[#4a524d]"
      : "border-2 border-[#4a524d] bg-white text-[#1d2420] hover:bg-[#eef1ef] disabled:border-[#b8bfba] disabled:text-[#6b736e]";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-keyshortcuts={ariaKeyshortcuts}
      className={`inline-flex min-h-[56px] items-center justify-center gap-[0.4em] rounded-[0.6em] px-[1.3em] py-[0.35em] text-[1.05em] font-bold transition-colors disabled:cursor-not-allowed ${styles} ${className}`}
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
    <div className="flex flex-col gap-[0.8em] text-[1em]">
      {blocks.map((b, bi) => {
        const t = b.trim();
        if (!t) return null;
        const h = t.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
          const level = h[1]!.length;
          const cls = level === 1 ? "text-[1.45em] font-bold" : level === 2 ? "mt-[0.4em] text-[1.2em] font-bold" : "text-[1.08em] font-bold";
          return (
            <p key={bi} role="heading" aria-level={level} className={cls}>
              {inline(h[2]!, `h${bi}`)}
            </p>
          );
        }
        const lines = t.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
          return (
            <ul key={bi} className="list-disc ps-[1.4em]">
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

/** Blocks phones (narrower than MIN_VIEWPORT_WIDTH). Tablets and larger screens may continue. */
export function DeviceGate({ children }: { children: ReactNode }) {
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
          <h1 className="text-[1.3em] font-bold">{t("common.deviceTooSmall.title")}</h1>
          <p className="mt-[0.7em]">{t("common.deviceTooSmall.body")}</p>
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
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-0 z-50 flex justify-center p-[0.6em]">
      <div className={`rounded-full px-[1em] py-[0.4em] text-[0.9em] font-bold shadow-lg ${status === "retrying" ? "bg-[var(--c-warning-soft)] text-[var(--c-warning)]" : "bg-[var(--c-fg)] text-white"}`}>
        {status === "retrying" ? t("common.retrying") : t("common.saving")}
      </div>
    </div>
  );
}
