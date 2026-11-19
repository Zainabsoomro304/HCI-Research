"use client";

import { useEffect, useState } from "react";
import { MIN_AGE } from "@/config/study";
import { SETTING_KEYS, SETTING_LEVELS } from "@/config/uiSpace";
import {
  BackgroundSchema,
  GENDERS,
  NO_PREFERENCE,
  OCCUPATIONS,
  PREF_ITEMS,
  READING_LANGUAGES,
  SHOPPING_FREQUENCIES,
  USE_FREQUENCIES,
  YES_NO,
  YES_NO_SOMETIMES,
} from "@/lib/questionnaire/background";
import type { StringKey } from "@/lib/strings";
import { useHydrated } from "@/lib/useHydrated";
import { PrefIllustration } from "./PrefIllustration";
import { Button, Card, Markdown, StudyPage, useT } from "./ui";

const CONSENT_BOXES = [
  ["readInformation", "consent.check.read"],
  ["agree", "consent.check.agree"],
  ["ageEligible", "consent.check.age"],
] as const satisfies readonly (readonly [string, StringKey])[];

/**
 * Information sheet and consent form. All three statements must be ticked. `reconfirm` is the shopping session's
 * re-confirmation: the same sheet under a heading that asks the participant to confirm again.
 */
export function ConsentStep({
  markdown,
  hash,
  onAgree,
  reconfirm = false,
}: {
  markdown: string;
  hash: string;
  onAgree: (hash: string, confirmations: Record<(typeof CONSENT_BOXES)[number][0], true>) => void;
  reconfirm?: boolean;
}) {
  const t = useT();
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(false);
  const hydrated = useHydrated();
  const all = CONSENT_BOXES.every(([id]) => ticked[id]);
  return (
    <StudyPage>
      <Card>
        {reconfirm && (
          <div className="mb-[1.2em] rounded-[0.6em] bg-[#E3F1EA] p-[0.9em]">
            <h1 className="text-[1.3em] font-bold">{t("consent.reconfirm.title")}</h1>
            <p className="mt-[0.4em]">{t("consent.reconfirm.body")}</p>
          </div>
        )}
        <Markdown text={markdown} />
        <h2 className="mt-[1.6em] text-[1.2em] font-bold">{t("consent.heading")}</h2>
        <p className="mt-[0.3em] text-[var(--c-muted)]">{t("consent.instruction")}</p>
        <div className="mt-[0.8em] flex flex-col gap-[0.6em]">
          {CONSENT_BOXES.map(([id, key]) => (
            <label key={id} className="flex cursor-pointer items-center gap-[0.7em] rounded-[0.6em] border-2 border-[var(--c-border)] p-[0.9em] font-bold">
              <input
                type="checkbox"
                name={id}
                checked={!!ticked[id]}
                onChange={(e) => {
                  setTicked((x) => ({ ...x, [id]: e.target.checked }));
                  setError(false);
                }}
                className="size-[1.4em] shrink-0 accent-[#1E6B4B]"
              />
              {t(key)}
            </label>
          ))}
        </div>
        {error && <p className="mt-[0.5em] font-bold text-[var(--c-warning)]">{t("consent.mustAgree")}</p>}
        <div className="mt-[1.4em] flex justify-end">
          <Button
            disabled={!hydrated}
            onClick={() => (all ? onAgree(hash, { readInformation: true, agree: true, ageEligible: true }) : setError(true))}
          >
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
    <fieldset id={`q-${id}`} className={`flex flex-col gap-[0.6em] rounded-[0.8em] border-2 p-[1em] ${error ? "border-[var(--c-warning)] bg-[var(--c-warning-soft)]" : "border-[var(--c-border)]"}`}>
      <legend className="sr-only">{label}</legend>
      <p className="font-bold" aria-hidden>
        {label}
      </p>
      {hint && <p className="-mt-[0.4em] text-[0.9em] text-[var(--c-muted)]">{hint}</p>}
      {children}
      {error && <p className="font-bold text-[var(--c-warning)]">{t("bg.required")}</p>}
    </fieldset>
  );
}

const choice = (selected: boolean) =>
  `flex min-h-[52px] cursor-pointer items-center gap-[0.5em] rounded-[0.6em] border-2 px-[0.9em] ${
    selected ? "border-[#1E6B4B] bg-[#E3F1EA] font-bold" : "border-[#c9cec9] bg-white hover:bg-[#eef1ef]"
  }`;

function Radios({ name, options, value, onChange, labelPrefix }: { name: string; options: readonly string[]; value?: string; onChange: (v: string) => void; labelPrefix: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-[0.5em]">
      {options.map((o) => (
        <label key={o} className={choice(value === o)}>
          <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="size-[1.1em] accent-[#1E6B4B]" />
          {t(`${labelPrefix}.${o}` as StringKey)}
        </label>
      ))}
    </div>
  );
}

function PrefRadios({ name, setting, value, onChange }: { name: string; setting: (typeof SETTING_KEYS)[number]; value?: string; onChange: (v: string) => void }) {
  const t = useT();
  const options = [...SETTING_LEVELS[setting], NO_PREFERENCE];
  return (
    <div className="flex flex-wrap gap-[0.6em]">
      {options.map((o) => (
        <label key={o} className={`flex w-[9.2em] cursor-pointer flex-col items-center gap-[0.4em] rounded-[0.8em] border-2 p-[0.6em] text-center ${value === o ? "border-[#1E6B4B] bg-[#E3F1EA] font-bold" : "border-[#c9cec9] bg-white hover:bg-[#eef1ef]"}`}>
          {o === NO_PREFERENCE ? <span className="grid h-[80px] w-[120px] place-items-center text-[1.6em] text-[var(--c-muted)]">–</span> : <PrefIllustration id={`${setting}.${o}`} />}
          <span className="flex items-center gap-[0.4em]">
            <input type="radio" name={name} value={o} checked={value === o} onChange={() => onChange(o)} className="size-[1.1em] accent-[#1E6B4B]" />
            {o === NO_PREFERENCE ? t("bg.noPreference") : t(`bg.${name}.${o}` as StringKey)}
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

export function BackgroundStep({
  token,
  onSubmit,
  onScreenOut,
}: {
  token: string;
  onSubmit: (answers: unknown) => Promise<boolean>;
  /** Age under MIN_AGE: only the age is sent, nothing else. */
  onScreenOut: (age: number) => Promise<boolean>;
}) {
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
    const age = Number(a.age);
    if (a.age && Number.isInteger(age) && age > 0 && age < MIN_AGE) {
      void onScreenOut(age).then((saved) => saved && clearDraft());
      return;
    }
    const candidate = {
      ...a,
      age: a.age ? age : undefined,
      techConfidence: a.techConfidence ? Number(a.techConfidence) : undefined,
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
  const radios = (id: string, label: StringKey, options: readonly string[], prefix: string) => (
    <Question id={id} label={t(label)} error={err(id)}>
      <Radios name={id} options={options} value={a[id]} onChange={set(id)} labelPrefix={prefix} />
    </Question>
  );
  return (
    <StudyPage wide>
      <Card>
        <h1 className="text-[1.45em] font-bold">{t("bg.title")}</h1>
        <p className="mt-[0.4em] text-[var(--c-muted)]">{t("bg.intro")}</p>
        <form
          className="mt-[1.2em] flex flex-col gap-[0.9em]"
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
              max={110}
              value={a.age ?? ""}
              onChange={(e) => set("age")(e.target.value)}
              aria-label={t("bg.age")}
              dir="ltr"
              className="min-h-[52px] w-[6em] rounded-[0.6em] border-2 border-[#c9cec9] bg-white px-[0.6em] text-[1.05em]"
            />
          </Question>
          {radios("gender", "bg.gender", GENDERS, "bg.gender")}
          <Question id="occupation" label={t("bg.occupation")} error={err("occupation")}>
            <Radios name="occupation" options={OCCUPATIONS} value={a.occupation} onChange={set("occupation")} labelPrefix="bg.occupation" />
          </Question>
          {radios("csOrIt", "bg.csOrIt", YES_NO, "bg")}
          <Question id="techConfidence" label={t("bg.techConfidence")} error={err("techConfidence")}>
            <div className="flex flex-wrap items-center gap-[0.6em]">
              <span className="w-[8em] text-end text-[0.85em] text-[var(--c-muted)]">{t("bg.techConfidence.low")}</span>
              <div className="flex gap-[0.4em]" role="radiogroup" aria-label={t("bg.techConfidence")}>
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <label
                    key={n}
                    className={`grid size-[52px] cursor-pointer place-items-center rounded-[0.6em] border-2 font-bold ${a.techConfidence === String(n) ? "border-[#1E6B4B] bg-[#1E6B4B] text-white" : "border-[#c9cec9] bg-white hover:bg-[#eef1ef]"}`}
                  >
                    <input type="radio" name="techConfidence" value={n} checked={a.techConfidence === String(n)} onChange={() => set("techConfidence")(String(n))} className="sr-only" />
                    {n}
                  </label>
                ))}
              </div>
              <span className="w-[8em] text-[0.85em] text-[var(--c-muted)]">{t("bg.techConfidence.high")}</span>
            </div>
          </Question>
          {radios("smartphoneUse", "bg.smartphoneUse", USE_FREQUENCIES, "bg.freq")}
          {radios("computerUse", "bg.computerUse", USE_FREQUENCIES, "bg.freq")}
          {radios("shoppingFrequency", "bg.shopping", SHOPPING_FREQUENCIES, "bg.shopping")}
          {radios("groceriesOnline", "bg.groceriesOnline", YES_NO, "bg")}
          {radios("readingGlasses", "bg.readingGlasses", YES_NO_SOMETIMES, "bg")}
          {radios("readingLanguage", "bg.readingLanguage", READING_LANGUAGES, "bg.readingLanguage")}

          <h2 className="mt-[0.8em] text-[1.2em] font-bold">{t("bg.prefsTitle")}</h2>
          <p className="-mt-[0.4em] text-[var(--c-muted)]">{t("bg.prefsIntro")}</p>
          {SETTING_KEYS.map((k) => {
            const item = PREF_ITEMS[k];
            return (
              <Question key={k} id={item} label={t(`bg.${item}` as StringKey)} error={err(item)}>
                <PrefRadios name={item} setting={k} value={a[item]} onChange={set(item)} />
              </Question>
            );
          })}

          {errors.size > 0 && <p className="font-bold text-[var(--c-warning)]">{t("bg.fixErrors")}</p>}
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
