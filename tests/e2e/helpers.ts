import { expect, type Page } from "@playwright/test";
import type { Lang } from "@/config/shop";
import { createParticipants } from "@/lib/participants";
import { makeT } from "@/lib/strings";

export async function newParticipant(phase: 1 | 3) {
  const [p] = await createParticipants({ studyPhase: phase, count: 1 });
  return p!;
}

/** UI text in either language, straight from the string tables, so every spec can run in English or Urdu. */
export const tr = (lang: Lang) => makeT(lang);

/** A regex for a string with {placeholders}, e.g. "Add {name} to basket" -> /^Add .+ to basket$/. */
export function trRe(lang: Lang, key: Parameters<ReturnType<typeof makeT>>[0]): RegExp {
  const raw = makeT(lang)(key);
  const parts = raw.split(/\{\w+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join(".+")}$`);
}

/** Speeds up clip playback 16x so full sessions run quickly; the real timing logic is unchanged. */
export async function fastVideos(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("play", (e) => ((e.target as HTMLVideoElement).playbackRate = 16), true);
  });
}

const LANGUAGE_BUTTON: Record<Lang, string> = { en: "English", ur: "اردو" };

export async function chooseLanguage(page: Page, lang: Lang = "en") {
  const t = tr(lang);
  await expect(page.getByRole("heading", { name: t("lang.title") })).toBeVisible();
  await page.getByRole("button", { name: LANGUAGE_BUTTON[lang], exact: true }).click();
  await expect(page.getByLabel(t("consent.agree"))).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ur" ? "rtl" : "ltr");
}

export async function doConsent(page: Page, lang: Lang = "en") {
  const t = tr(lang);
  await expect(page.getByRole("button", { name: t("common.continue") })).toBeEnabled(); // hydrated
  await page.getByLabel(t("consent.agree")).check();
  await page.getByRole("button", { name: t("common.continue") }).click();
  await expect(page.getByRole("heading", { name: t("bg.title") })).toBeVisible();
  await expect(page.getByRole("button", { name: t("bg.submit") })).toBeEnabled();
}

/** Fills the background questionnaire by input names and values, which do not depend on the language. */
export async function fillBackground(page: Page, age = 56) {
  await page.locator("#q-age input").fill(String(age));
  const radios: [string, string][] = [
    ["gender", "woman"],
    ["occupation", "homemaker"],
    ["csOrIt", "no"],
    ["techConfidence", "4"],
    ["smartphoneUse", "daily"],
    ["computerUse", "monthly"],
    ["shoppingFrequency", "lessThanMonthly"],
    ["groceriesOnline", "no"],
    ["readingGlasses", "sometimes"],
    ["readingLanguage", "both"],
    ["prefTextSize", "large"],
    ["prefTargetSize", "large"],
    ["prefButtonStyle", "raised"],
    ["prefIconLabels", "iconText"],
    ["prefContrast", "noPreference"],
    ["prefLayout", "list"],
    ["prefGuidance", "hints"],
  ];
  for (const [n, v] of radios) await page.locator(`input[name="${n}"][value="${v}"]`).check({ force: true });
}

/** Language choice, consent and the background questionnaire, ending on the instructions page. */
export async function doConsentAndBackground(page: Page, lang: Lang = "en") {
  const t = tr(lang);
  await chooseLanguage(page, lang);
  await doConsent(page, lang);
  await fillBackground(page);
  await page.getByRole("button", { name: t("bg.submit") }).click();
  await expect(page.getByRole("heading", { name: t("instr.title") })).toBeVisible();
}

/** Answers the trial on screen once the choice buttons become enabled. */
export async function answerTrial(page: Page, side: "A" | "B", lang: Lang = "en") {
  const t = tr(lang);
  const btn = page.getByRole("button", { name: side === "A" ? t("trial.chooseA") : t("trial.chooseB") });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
}

/** Reads "Comparison X of N" / "Practice X of N" from the progress header (English only). */
export async function currentTrial(page: Page): Promise<{ practice: boolean; index: number }> {
  const text = await page.locator("header").first().innerText({ timeout: 2000 });
  const m = text.match(/(Practice|Comparison) (\d+) of/);
  if (!m) throw new Error(`No trial header: ${text}`);
  return { practice: m[1] === "Practice", index: Number(m[2]) };
}

/** Runs practice and all 82 comparisons, answering attention checks correctly. Returns the number of breaks. */
export async function runComparisons(page: Page, lang: Lang = "en"): Promise<number> {
  const t = tr(lang);
  await page.getByRole("button", { name: t("instr.start") }).click();
  for (let i = 1; i <= 2; i++) {
    await expect(page.getByText(t("trial.practiceProgress", { current: i, total: 2 }))).toBeVisible();
    await answerTrial(page, "A", lang);
  }
  await expect(page.getByRole("heading", { name: t("mainIntro.title") })).toBeVisible();
  await page.getByRole("button", { name: t("mainIntro.start"), exact: true }).click();
  let breaks = 0;
  for (let i = 1; i <= 82; i++) {
    await expect(page.getByText(t("trial.progress", { current: i, total: 82 }))).toBeVisible();
    const chooseB = await page.getByText(t("trial.questionChooseB")).isVisible();
    await answerTrial(page, chooseB ? "B" : i % 3 === 0 ? "B" : "A", lang);
    if (i === 27 || i === 54) {
      await expect(page.getByRole("heading", { name: t("break.title") })).toBeVisible();
      breaks++;
      await page.getByRole("button", { name: t("common.continue") }).click();
    }
  }
  await expect(page.getByRole("heading", { name: t("end.title") })).toBeVisible();
  return breaks;
}
