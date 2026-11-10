"use client";

import { LANGUAGES, type Lang } from "@/config/shop";
import { EXPECTED_MINUTES, MIN_AGE } from "@/config/study";
import { makeT } from "@/lib/strings";
import { Button, Card, StudyPage, useT } from "./ui";

const LANGUAGE_NAMES: Record<Lang, string> = { en: "English", ur: "اردو" };

/** The first screen: the choice is shown in both languages, each in its own script. */
export function LanguageStep({ current, onChoose }: { current: Lang; onChoose: (lang: Lang) => void }) {
  return (
    <StudyPage>
      <Card>
        <div className="flex flex-col gap-[1.2em]">
          {LANGUAGES.map((l) => {
            const t = makeT(l);
            return (
              <div key={l} dir={l === "ur" ? "rtl" : "ltr"} lang={l} style={{ fontSize: l === "ur" ? "1.1em" : "1em", lineHeight: l === "ur" ? 2.1 : 1.55 }}>
                <h1 className="text-[1.35em] font-bold">{t("lang.title")}</h1>
                <p className="text-[var(--c-muted)]">{t("lang.intro")}</p>
              </div>
            );
          })}
          <div className="grid grid-cols-2 gap-[1em] pt-[0.4em]">
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                dir={l === "ur" ? "rtl" : "ltr"}
                onClick={() => onChoose(l)}
                className={`min-h-[80px] rounded-[0.6em] border-2 px-[1em] text-[1.4em] font-bold transition-colors ${
                  current === l ? "border-[#1E6B4B] bg-[#E3F1EA] text-[#13553D]" : "border-[#4a524d] bg-white text-[#1d2420] hover:bg-[#eef1ef]"
                }`}
              >
                {LANGUAGE_NAMES[l]}
              </button>
            ))}
          </div>
        </div>
      </Card>
    </StudyPage>
  );
}

export function IneligibleStep() {
  const t = useT();
  return <MessagePage title={t("eligibility.title")} body={t("eligibility.body", { minAge: MIN_AGE })} />;
}

/** One short instruction per line, numbered, so each can be read on its own. */
export function InstructionsStep({ practiceCount, onStart }: { practiceCount: number; onStart: () => void }) {
  const t = useT();
  const steps = [t("instr.step1"), t("instr.step2"), t("instr.step3"), t("instr.step4"), t("instr.step5")];
  return (
    <StudyPage>
      <Card>
        <h1 className="text-[1.45em] font-bold">{t("instr.title")}</h1>
        <ol className="mt-[1em] flex flex-col gap-[0.7em]">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-[0.7em]">
              <span className="grid size-[1.7em] shrink-0 place-items-center rounded-full bg-[#1E6B4B] text-[0.9em] font-bold text-white">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-[1.2em] font-bold">{t("instr.practice", { count: practiceCount })}</p>
        <p className="mt-[0.6em]">{t("instr.duration", { minutes: EXPECTED_MINUTES.comparison })}</p>
        <div className="mt-[1.6em] flex justify-end">
          <Button onClick={onStart}>{t("instr.start")}</Button>
        </div>
      </Card>
    </StudyPage>
  );
}

export function MainIntroStep({ total, breaks, onStart }: { total: number; breaks: number; onStart: () => void }) {
  const t = useT();
  return (
    <StudyPage>
      <Card>
        <h1 className="text-[1.45em] font-bold">{t("mainIntro.title")}</h1>
        <p className="mt-[0.8em]">{t("mainIntro.body", { count: total, breaks })}</p>
        <div className="mt-[1.6em] flex justify-end">
          <Button onClick={onStart}>{t("mainIntro.start")}</Button>
        </div>
      </Card>
    </StudyPage>
  );
}

export function BreakStep({ done, total, onContinue }: { done: number; total: number; onContinue: () => void }) {
  const t = useT();
  return (
    <StudyPage>
      <Card className="text-center">
        <h1 className="text-[1.45em] font-bold">{t("break.title")}</h1>
        <p className="mt-[0.8em]">{t("break.body", { done, total })}</p>
        <div className="mx-auto mt-[1.2em] h-[0.6em] max-w-[20em] overflow-hidden rounded-full bg-[#e3e7e4]">
          <div className="h-full rounded-full bg-[#1E6B4B]" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <div className="mt-[1.6em] flex justify-center">
          <Button onClick={onContinue}>{t("common.continue")}</Button>
        </div>
      </Card>
    </StudyPage>
  );
}

export function EndStep({ variant, completionCode }: { variant: "phase1" | "sessionA" | "sessionB"; completionCode: string | null }) {
  const t = useT();
  return (
    <StudyPage>
      <Card className="text-center">
        <h1 className="text-[1.65em] font-bold">{t("end.title")}</h1>
        {variant === "phase1" ? (
          <>
            <p className="mt-[0.8em]">{t("end.phase1")}</p>
            <p dir="ltr" className="mt-[0.8em] inline-block select-all rounded-[0.6em] border-2 border-dashed border-[#1E6B4B] px-[1.2em] py-[0.5em] font-mono text-[1.6em] font-bold tracking-widest">
              {completionCode}
            </p>
          </>
        ) : (
          <p className="mt-[0.8em]">{t(variant === "sessionA" ? "end.sessionA" : "end.sessionB")}</p>
        )}
        <p className="mt-[1.2em] text-[var(--c-muted)]">{t("end.close")}</p>
      </Card>
    </StudyPage>
  );
}

export function MessagePage({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <StudyPage>
      <Card>
        <h1 className="text-[1.3em] font-bold">{title}</h1>
        <p className="mt-[0.7em]">{body}</p>
        {action && (
          <div className="mt-[1.2em]">
            <Button onClick={action.onClick}>{action.label}</Button>
          </div>
        )}
      </Card>
    </StudyPage>
  );
}
