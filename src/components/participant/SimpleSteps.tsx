"use client";

import { Button, Card, StudyPage, useT } from "./ui";

export function InstructionsStep({ practiceCount, onStart }: { practiceCount: number; onStart: () => void }) {
  const t = useT();
  return (
    <StudyPage>
      <Card>
        <h1 className="text-[24px] font-bold">{t("instr.title")}</h1>
        <div className="mt-4 flex flex-col gap-3 text-[17px] leading-relaxed">
          <p>{t("instr.p1")}</p>
          <p>{t("instr.p2")}</p>
          <p>{t("instr.p3")}</p>
          <p className="font-semibold">{t("instr.p4", { count: practiceCount })}</p>
        </div>
        <div className="mt-8 flex justify-end">
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
        <h1 className="text-[24px] font-bold">{t("mainIntro.title")}</h1>
        <p className="mt-4 text-[17px] leading-relaxed">{t("mainIntro.body", { count: total, breaks })}</p>
        <div className="mt-8 flex justify-end">
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
        <h1 className="text-[24px] font-bold">{t("break.title")}</h1>
        <p className="mt-4 text-[17px] leading-relaxed">{t("break.body", { done, total })}</p>
        <div className="mx-auto mt-6 h-2 max-w-sm overflow-hidden rounded-full bg-[#e3e7ec]">
          <div className="h-full rounded-full bg-[var(--c-accent)]" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <div className="mt-8 flex justify-center">
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
        <h1 className="text-[28px] font-bold">{t("end.title")}</h1>
        {variant === "phase1" ? (
          <>
            <p className="mt-4 text-[17px]">{t("end.phase1")}</p>
            <p className="mt-4 inline-block rounded-xl border-2 border-dashed border-[var(--c-accent)] px-6 py-3 font-mono text-[28px] font-bold tracking-widest select-all">
              {completionCode}
            </p>
          </>
        ) : variant === "sessionA" ? (
          <p className="mt-4 text-[17px]">{t("end.sessionA")}</p>
        ) : (
          <p className="mt-4 text-[17px]">{t("end.sessionB")}</p>
        )}
        <p className="mt-6 text-[15px] text-[var(--c-muted)]">{t("end.close")}</p>
      </Card>
    </StudyPage>
  );
}

export function MessagePage({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <StudyPage>
      <Card>
        <h1 className="text-[22px] font-bold">{title}</h1>
        <p className="mt-3 text-[16px] text-[var(--c-muted)]">{body}</p>
        {action && (
          <div className="mt-6">
            <Button onClick={action.onClick}>{action.label}</Button>
          </div>
        )}
      </Card>
    </StudyPage>
  );
}
