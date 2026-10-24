import { expect, type Page } from "@playwright/test";
import { createParticipants } from "@/lib/participants";

export async function newParticipant(phase: 1 | 3) {
  const [p] = await createParticipants({ studyPhase: phase, count: 1 });
  return p!;
}

/** Speeds up clip playback 16x so full sessions run quickly; the real timing logic is unchanged. */
export async function fastVideos(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("play", (e) => ((e.target as HTMLVideoElement).playbackRate = 16), true);
  });
}

export async function doConsentAndBackground(page: Page) {
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled(); // hydrated
  await page.getByLabel("I agree to take part").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.getByLabel("How old are you?").fill("29");
  await page.getByLabel("Woman", { exact: true }).check();
  await page.getByLabel("Student", { exact: true }).check();
  await page.getByLabel("What is your field of study or work?").fill("Biology");
  await page.locator('input[name="csOrIt"][value="no"]').check({ force: true });
  await page.locator('input[name="techConfidence"][value="6"]').check({ force: true });
  await page.getByLabel("About once a week").check();
  const prefs: [string, string][] = [
    ["prefLayout", "list"],
    ["prefTextSize", "medium"],
    ["prefDetail", "lots"],
    ["prefTheme", "light"],
    ["prefMenu", "dropdown"],
  ];
  for (const [n, v] of prefs) await page.locator(`input[name="${n}"][value="${v}"]`).check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "How this works" })).toBeVisible();
}

/** Answers the trial on screen once the choice buttons become enabled. */
export async function answerTrial(page: Page, side: "A" | "B") {
  const btn = page.getByRole("button", { name: side === "A" ? "I prefer A" : "I prefer B" });
  await expect(btn).toBeEnabled({ timeout: 30_000 });
  await btn.click();
}

/** Reads "Trial X of N" / "Practice X of N" from the progress header. */
export async function currentTrial(page: Page): Promise<{ practice: boolean; index: number }> {
  const text = await page.locator("header span").first().innerText({ timeout: 2000 });
  const m = text.match(/(Practice|Trial) (\d+) of/);
  if (!m) throw new Error(`No trial header: ${text}`);
  return { practice: m[1] === "Practice", index: Number(m[2]) };
}
