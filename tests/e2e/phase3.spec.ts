import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import type { FrozenResult } from "@/lib/phase3/freeze";
import { answerTrial, doConsentAndBackground, fastVideos, newParticipant } from "./helpers";

/** REHEARSAL_N=31 runs the full rehearsal size. The default keeps the normal end-to-end run reasonably quick. */
const SIMULATED = Number(process.env.REHEARSAL_N ?? 15);
const ANALYSIS_DATA = path.resolve("analysis/data");

async function login(page: Page) {
  await page.goto("/admin/login");
  await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled();
  await page.getByLabel("Password").fill("e2e-admin");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Create participants" })).toBeVisible();
}

async function completeSessionA(page: Page, token: string) {
  await fastVideos(page);
  await page.goto(`/s/${token}`);
  await doConsentAndBackground(page);
  await page.getByRole("button", { name: "Start practice" }).click();
  for (let i = 1; i <= 2; i++) {
    await expect(page.getByText(`Practice ${i} of 2`)).toBeVisible();
    await answerTrial(page, "A");
  }
  await expect(page.getByRole("heading", { name: "Practice complete" })).toBeVisible();
  await page.getByRole("button", { name: "Start" }).click();
  for (let i = 1; i <= 82; i++) {
    await expect(page.getByText(`Trial ${i} of 82`)).toBeVisible();
    const chooseB = await page.getByText("For this trial, please choose B.").isVisible();
    await answerTrial(page, chooseB || i % 3 === 0 ? "B" : "A");
    if (i === 27 || i === 54) {
      await expect(page.getByRole("heading", { name: "Take a short break" })).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();
    }
  }
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();
}

async function answerQuestionnaire(page: Page, heading: RegExp) {
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  for (const fieldset of await page.locator("fieldset").all()) {
    const options = fieldset.locator("input[type=radio]");
    await options.nth(Math.floor((await options.count()) / 2)).check({ force: true });
  }
  await page.getByRole("button", { name: "Continue" }).click();
}

async function finishTask(page: Page) {
  await page.getByRole("button", { name: "Finish task" }).click();
  await page.getByRole("button", { name: "Yes, finish" }).click();
}

test("the whole experiment runs from the admin panel, with one real and many simulated participants", async ({ page, context }) => {
  test.setTimeout(30 * 60_000);
  await prisma.participant.deleteMany({});
  await prisma.frozenModel.deleteMany({});
  await prisma.freezeJob.deleteMany({});
  await prisma.adminAction.deleteMany({});

  await login(page);
  await page.goto("/admin/phase3");
  await expect(page.getByText(/TEST MODE/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Run the whole rehearsal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Freeze models & generate plans" })).toBeDisabled();

  // Admin creates simulated participants and simulates their Session A.
  await page.getByLabel("How many").fill(String(SIMULATED));
  await page.getByLabel("Attention error rate (%)").fill("0");
  await expect(page.getByRole("button", { name: "Create simulated participants" })).toBeEnabled();
  await page.getByRole("button", { name: "Create simulated participants" }).click();
  await expect(page.getByText(new RegExp(`Created ${SIMULATED}:`))).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: `Simulate Session A (${SIMULATED})` })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: `Simulate Session A (${SIMULATED})` }).click();
  await expect(page.getByText(`Done: ${SIMULATED} simulated.`)).toBeVisible({ timeout: 15 * 60_000 });

  // A scripted real participant completes Session A through the participant interface, in their own tab.
  const real = await newParticipant(3);
  const sessionA = real.sessions.find((s) => s.type === "p3_sessionA")!;
  const sessionB = real.sessions.find((s) => s.type === "p3_sessionB")!;
  await page.reload();
  await expect(page.getByTestId("readiness")).toContainText(real.code);
  await expect(page.getByRole("button", { name: "Freeze models & generate plans" })).toBeDisabled();
  const participantTab = await context.newPage();
  await completeSessionA(participantTab, sessionA.token);

  // Admin clicks Freeze & generate.
  await page.reload();
  await expect(page.getByTestId("readiness")).toContainText("Ready");
  await expect(page.getByRole("button", { name: "Freeze models & generate plans" })).toBeEnabled();
  await page.getByRole("button", { name: "Freeze models & generate plans" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm freeze" });
  await expect(dialog).toContainText(`${SIMULATED + 1}`);
  await expect(dialog).toContainText(`of which ${SIMULATED} are simulated`);
  await expect(dialog).toContainText("cannot be changed once any Session B starts");
  await dialog.getByRole("button", { name: "Freeze and generate" }).click();

  // The results table shows everyone.
  await expect(page.getByTestId("plan-row")).toHaveCount(SIMULATED + 1, { timeout: 10 * 60_000 });
  await expect(page.getByRole("link", { name: "Download all computed plans" })).toBeVisible();
  await expect(page.getByTestId("plan-results").locator("img").first()).toBeVisible();
  await expect(page.getByText(/matched each simulated/)).toBeVisible();
  const frozen = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
  expect(frozen.computeMs).toBeGreaterThan(0);
  console.log(`Freeze: ${frozen.computeMs} ms for ${SIMULATED + 1} participants`);
  const results = frozen.results as unknown as FrozenResult[];
  expect(results.every((r) => r.agent.matches)).toBe(true);
  const mine = results.find((r) => r.code === real.code)!;

  // Start Session B from the admin page. The shop adapts to the computed target in each condition.
  await page.goto(`/admin/p/${real.code}`);
  await expect(page.getByRole("button", { name: "Start Session B" })).toBeEnabled();
  const popupEvent = context.waitForEvent("page");
  await page.getByRole("button", { name: "Start Session B" }).click();
  const shop = await popupEvent;
  await shop.waitForLoadState();
  expect(shop.url()).toContain(sessionB.token);
  await expect(shop.getByRole("heading", { name: "Welcome to the second session" })).toBeVisible({ timeout: 30_000 });
  await shop.getByRole("button", { name: "Start practice task" }).click();
  await expect(shop.getByText("Practice", { exact: true })).toBeVisible();
  await shop.getByRole("button", { name: "Add to cart" }).first().click();
  await finishTask(shop);

  const blocks = await prisma.taskBlock.findMany({ where: { sessionId: sessionB.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
  for (const block of blocks) {
    await expect(shop.getByText(`Task ${block.blockIndex + 1} of 4`)).toBeVisible();
    await shop.getByRole("button", { name: "Start shopping" }).click();
    await expect(shop.getByRole("button", { name: "Finish task" })).toBeVisible();
    await expect(shop.locator(".shop")).toHaveAttribute("data-config-id", "list-default-detailed-light-sidebar");
    const adds = shop.getByRole("button", { name: "Add to cart" });
    await adds.nth(0).click();
    await adds.nth(1).click();
    await adds.nth(2).click();
    const target = mine.targets[block.condition as keyof typeof mine.targets];
    await expect(shop.locator(".shop")).toHaveAttribute("data-config-id", target, { timeout: 20_000 });
    await finishTask(shop);
    await answerQuestionnaire(shop, /Satisfaction with the interface/);
    await answerQuestionnaire(shop, /Your experience/);
  }
  await expect(shop.getByRole("heading", { name: "Compare the four shops" })).toBeVisible();
  await shop.getByRole("button", { name: "Submit ranking" }).click();
  await expect(shop.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  const done = await prisma.taskBlock.findMany({ where: { sessionId: sessionB.id, isPractice: false } });
  for (const b of done) expect(b.finalConfigId).toBe(mine.targets[b.condition as keyof typeof mine.targets]);

  // Freezing is now locked.
  await page.goto("/admin/phase3");
  await expect(page.getByTestId("readiness")).toContainText("models are frozen");
  await expect(page.getByRole("button", { name: /Freeze models & generate plans/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Unfreeze (compromises the study)" })).toBeVisible();

  // Simulate Session B for the rest, so the Phase 3 statistics can be rehearsed.
  await expect(page.getByRole("button", { name: `Simulate Session B (${SIMULATED})` })).toBeEnabled();
  await page.getByRole("button", { name: `Simulate Session B (${SIMULATED})` }).click();
  await expect(page.getByText(`Done: ${SIMULATED} simulated.`)).toBeVisible({ timeout: 15 * 60_000 });

  // The downloads and the export contain the new files.
  expect((await page.request.get("/api/admin/phase3/downloads?what=model")).status()).toBe(200);
  const planZip = await JSZip.loadAsync(await (await page.request.get("/api/admin/phase3/downloads?what=plans")).body());
  expect(Object.keys(planZip.files)).toHaveLength(SIMULATED + 1);
  const exported = await (await page.request.get("/api/admin/export?phase=3&simulated=1&completed=1")).body();
  const zip = await JSZip.loadAsync(exported);
  expect(JSON.parse(await zip.file("frozen_model.json")!.async("string")).version).toBe(1);
  expect((await zip.file("plans.csv")!.async("string")).trim().split("\n")).toHaveLength(SIMULATED + 2);

  // The Python loader reads the export.
  fs.mkdirSync(ANALYSIS_DATA, { recursive: true });
  const exportPath = path.join(ANALYSIS_DATA, process.env.REHEARSAL_N ? "rehearsal_export.zip" : "e2e_export.zip");
  fs.writeFileSync(exportPath, exported);
  const output = execFileSync("python", ["-m", "uv", "run", "hci", "validate", "--export", path.relative("analysis", exportPath).replace(/\\/g, "/")], { cwd: "analysis", encoding: "utf8" });
  expect(output).toContain("SYNTHETIC");
  expect(output).toContain(`Eligible participants: ${SIMULATED + 1}`);
});
