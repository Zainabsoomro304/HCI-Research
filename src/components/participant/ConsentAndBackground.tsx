"use client";

import { useEffect, useState } from "react";
import {
  BackgroundSchema,
  GENDERS,
  OCCUPATIONS,
  PREF_DETAIL,
  PREF_LAYOUT,
  PREF_MENU,
  PREF_TEXT_SIZE,
  PREF_THEME,
  SHOPPING_FREQUENCIES,
} from "@/lib/questionnaire/background";
import type { StringKey } from "@/lib/strings";
import { useHydrated } from "@/lib/useHydrated";
import { PrefIllustration } from "./PrefIllustration";
import { Button, Card, Markdown, StudyPage, useT } from "./ui";

export function ConsentStep({ markdown, hash, onAgree }: { markdown: string; hash: string; onAgree: (hash: string) => void }) {
  const t = useT();
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState(false);
  const hydrated = useHydrated();
  return (
    <StudyPage>
      <Card>
        <Markdown text={markdown} />
        <label className="mt-8 flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--c-border)] p-4 text-[16px] font-semibold">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => {
              setAgreed(e.target.checked);
              setError(false);
            }}
            className="size-5 accent-[var(--c-accent)]"
          />
          {t("consent.agree")}
        </label>
        {error && <p className="mt-2 text-[14px] text-[var(--c-warning)]">{t("consent.mustAgree")}</p>}
        <div className="mt-6 flex justify-end">
          <Button disabled={!hydrated} onClick={() => (agreed ? onAgree(hash) : setError(true))}>
            {t("common.continue")}
          </Button>
        </div>
      </Card>
    </StudyPage>
  );
}

type Answers = Record<string, string>;

function Question({ id, label, error, children, hint }: { id: string; label: string; error?: boolean; hint?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <fieldset
      id={`q-${id}`}
      className={`flex flex-col gap-3 rounded-xl border p-5 ${error ? "border-[var(--c-warning)] bg-[var(--c-warning-soft)]" : "border-[var(--c-border)]"}`}
    >
      <legend className="sr-only">{label}</legend>
      <p className="text-[16px] font-semibold" aria-hidden>
        {label}
      </p>
      {hint && <p className="-mt-2 text-[14px] text-[var(--c-muted)]">{hint}</p>}
      {children}
      {error && <p className="text-[14px] font-semibold text-[var(--c-warning)]">{t("bg.required")}</p>}
    </fieldset>
  );
}

function Radios({ name, options, value, onChange, labelPrefix }: { name: string; options: readonly string[]; value?: string; onChange: (v: string) => void; labelPrefix: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label
          key={o}
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3.5 py-2 text-[15px] ${
            value === o ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] font-semibold" : "border-[var(--c-border)] bg-[var(--c-surface)] hover:bg-[var(--c-surface-hover)]"
          }`}
        >
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="accent-[var(--c-accent)]" />
          {t(`${labelPrefix}.${o}` as StringKey)}
        </label>
      ))}
    </div>
  );
}

function PrefRadios({ name, options, value, onChange, labelPrefix, illPrefix }: { name: string; options: readonly string[]; value?: string; onChange: (v: string) => void; labelPrefix: string; illPrefix: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((o) => (
        <label
          key={o}
          className={`flex w-[150px] cursor-pointer flex-col items-center gap-2 rounded-xl border p-3 text-center text-[14px] ${
            value === o ? "border-[var(--c-accent)] bg-[var(--c-accent-soft)] font-semibold" : "border-[var(--c-border)] bg-[var(--c-surface)] hover:bg-[var(--c-surface-hover)]"
          }`}
        >
          {o === "noPreference" ? <span className="grid h-[80px] w-[120px] place-items-center text-[28px] text-[var(--c-muted)]">–</span> : <PrefIllustration id={`${illPrefix}.${o}`} />}
          <span className="flex items-center gap-1.5">
            <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="accent-[var(--c-accent)]" />
            {o === "noPreference" ? t("bg.noPreference") : t(`${labelPrefix}.${o}` as StringKey)}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Unsubmitted answers are kept as a browser-local draft so a reload or closed tab does not lose them. */
function useDraft(key: string) {
  const [a, setA] = useState<Answers>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setA(JSON.parse(raw) as Answers);
    } catch {
      // storage unavailable: start empty
    }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(a));
    } catch {
      // ignore
    }
  }, [key, a, loaded]);
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  };
  return [a, setA, clear] as const;
}

export function BackgroundStep({ token, onSubmit }: { token: string; onSubmit: (answers: unknown) => Promise<boolean> }) {
  const t = useT();
  const [a, setA, clearDraft] = useDraft(`bg-draft:${token}`);
  const hydrated = useHydrated();
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const set = (k: string) => (v: string) => {
    setA((prev) => ({ ...prev, [k]: v }));
    setErrors((e) => {
      const n = new Set(e);
      n.delete(k);
      return n;
    });
  };

  const submit = () => {
    const candidate = {
      ...a,
      age: a.age ? Number(a.age) : undefined,
      techConfidence: a.techConfidence ? Number(a.techConfidence) : undefined,
      field: a.field ?? "",
      genderSelfDescribe: a.genderSelfDescribe || undefined,
      occupationOther: a.occupationOther || undefined,
    };
    const r = BackgroundSchema.safeParse(candidate);
    if (!r.success) {
      const errs = new Set(r.error.issues.map((i) => String(i.path[0])));
      setErrors(errs);
      document.getElementById(`q-${[...errs][0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    void onSubmit(r.data).then((saved) => saved && clearDraft());
  };

  const err = (k: string) => errors.has(k);
  return (
    <StudyPage>
      <Card>
        <h1 className="text-[24px] font-bold">{t("bg.title")}</h1>
        <p className="mt-2 text-[16px] text-[var(--c-muted)]">{t("bg.intro")}</p>
        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <Question id="age" label={t("bg.age")} hint={t("bg.ageHint")} error={err("age")}>
            <input
              type="number"
              inputMode="numeric"
              min={18}
              max={99}
              value={a.age ?? ""}
              onChange={(e) => set("age")(e.target.value)}
              aria-label={t("bg.age")}
              className="w-32 rounded-lg border border-[var(--c-border)] bg-white px-3 py-2 text-[16px]"
            />
          </Question>
          <Question id="gender" label={t("bg.gender")} error={err("gender") || err("genderSelfDescribe")}>
            <Radios name="gender" options={GENDERS} value={a.gender} onChange={set("gender")} labelPrefix="bg.gender" />
            {a.gender === "selfDescribe" && (
              <input
                type="text"
                maxLength={100}
                value={a.genderSelfDescribe ?? ""}
                onChange={(e) => set("genderSelfDescribe")(e.target.value)}
                placeholder={t("bg.genderSelfDescribe")}
                aria-label={t("bg.genderSelfDescribe")}
                className="max-w-sm rounded-lg border border-[var(--c-border)] bg-white px-3 py-2 text-[16px]"
              />
            )}
          </Question>
          <Question id="occupation" label={t("bg.occupation")} error={err("occupation")}>
            <Radios name="occupation" options={OCCUPATIONS} value={a.occupation} onChange={set("occupation")} labelPrefix="bg.occupation" />
            {a.occupation === "other" && (
              <input
                type="text"
                maxLength={100}
                value={a.occupationOther ?? ""}
                onChange={(e) => set("occupationOther")(e.target.value)}
                placeholder={t("bg.occupationOther")}
                aria-label={t("bg.occupationOther")}
                className="max-w-sm rounded-lg border border-[var(--c-border)] bg-white px-3 py-2 text-[16px]"
              />
            )}
          </Question>
          <Question id="field" label={t("bg.field")} hint={t("bg.fieldHint")} error={err("field")}>
            <input
              type="text"
              maxLength={200}
              value={a.field ?? ""}
              onChange={(e) => set("field")(e.target.value)}
              aria-label={t("bg.field")}
              className="max-w-md rounded-lg border border-[var(--c-border)] bg-white px-3 py-2 text-[16px]"
            />
          </Question>
          <Question id="csOrIt" label={t("bg.csOrIt")} error={err("csOrIt")}>
            <Radios name="csOrIt" options={["yes", "no"]} value={a.csOrIt} onChange={set("csOrIt")} labelPrefix="bg" />
          </Question>
          <Question id="techConfidence" label={t("bg.techConfidence")} error={err("techConfidence")}>
            <div className="flex items-center gap-3">
              <span className="w-28 text-right text-[13px] text-[var(--c-muted)]">{t("bg.techConfidence.low")}</span>
              <div className="flex gap-1.5" role="radiogroup" aria-label={t("bg.techConfidence")}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <label
                    key={n}
                    className={`grid size-11 cursor-pointer place-items-center rounded-lg border text-[16px] font-semibold ${
                      a.techConfidence === String(n) ? "border-[var(--c-accent)] bg-[var(--c-accent)] text-white" : "border-[var(--c-border)] bg-white hover:bg-[var(--c-surface-hover)]"
                    }`}
                  >
                    <input type="radio" name="techConfidence" value={n} checked={a.techConfidence === String(n)} onChange={() => set("techConfidence")(String(n))} className="sr-only" />
                    {n}
                  </label>
                ))}
              </div>
              <span className="w-28 text-[13px] text-[var(--c-muted)]">{t("bg.techConfidence.high")}</span>
            </div>
          </Question>
          <Question id="shoppingFrequency" label={t("bg.shopping")} error={err("shoppingFrequency")}>
            <Radios name="shoppingFrequency" options={SHOPPING_FREQUENCIES} value={a.shoppingFrequency} onChange={set("shoppingFrequency")} labelPrefix="bg.shopping" />
          </Question>

          <h2 className="mt-4 text-[19px] font-bold">{t("bg.prefsTitle")}</h2>
          <p className="-mt-2 text-[15px] text-[var(--c-muted)]">{t("bg.prefsIntro")}</p>
          <Question id="prefLayout" label={t("bg.prefLayout")} error={err("prefLayout")}>
            <PrefRadios name="prefLayout" options={PREF_LAYOUT} value={a.prefLayout} onChange={set("prefLayout")} labelPrefix="bg.prefLayout" illPrefix="layout" />
          </Question>
          <Question id="prefTextSize" label={t("bg.prefTextSize")} error={err("prefTextSize")}>
            <PrefRadios name="prefTextSize" options={PREF_TEXT_SIZE} value={a.prefTextSize} onChange={set("prefTextSize")} labelPrefix="bg.prefTextSize" illPrefix="text" />
          </Question>
          <Question id="prefDetail" label={t("bg.prefDetail")} error={err("prefDetail")}>
            <PrefRadios name="prefDetail" options={PREF_DETAIL} value={a.prefDetail} onChange={set("prefDetail")} labelPrefix="bg.prefDetail" illPrefix="detail" />
          </Question>
          <Question id="prefTheme" label={t("bg.prefTheme")} error={err("prefTheme")}>
            <PrefRadios name="prefTheme" options={PREF_THEME} value={a.prefTheme} onChange={set("prefTheme")} labelPrefix="bg.prefTheme" illPrefix="theme" />
          </Question>
          <Question id="prefMenu" label={t("bg.prefMenu")} error={err("prefMenu")}>
            <PrefRadios name="prefMenu" options={PREF_MENU} value={a.prefMenu} onChange={set("prefMenu")} labelPrefix="bg.prefMenu" illPrefix="menu" />
          </Question>

          {errors.size > 0 && <p className="text-[15px] font-semibold text-[var(--c-warning)]">{t("bg.fixErrors")}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={!hydrated}>
              {t("bg.submit")}
            </Button>
          </div>
        </form>
      </Card>
    </StudyPage>
  );
}
