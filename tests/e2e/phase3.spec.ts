import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import type { FrozenResult } from "@/lib/phase3/freeze";
import type { Lang } from "@/config/shop";
import { doConsentAndBackground, fastVideos, newParticipant, runComparisons, tr, trRe } from "./helpers";

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

/** The scripted real participant does the whole study in Urdu (REAL_LANG=en for English). */
const LANG: Lang = process.env.REAL_LANG === "en" ? "en" : "ur";
const t = tr(LANG);
const instrumentTitle = (name: string) =>
  (JSON.parse(fs.readFileSync(path.resolve(`content/questionnaires/${name}.${LANG}.json`), "utf8")) as { title: string }).title;

async function completeSessionA(page: Page, token: string) {
  await fastVideos(page);
  await page.goto(`/s/${token}`);
  await doConsentAndBackground(page, LANG);
  expect(await runComparisons(page, LANG)).toBe(2);
}

async function answerQuestionnaire(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  for (const fieldset of await page.locator("fieldset").all()) {
    const options = fieldset.locator("input[type=radio]");
    await options.nth(Math.floor((await options.count()) / 2)).check({ force: true });
  }
  await page.getByRole("button", { name: t("q.submit") }).click();
}

async function finishTask(page: Page) {
  await page.getByRole("button", { name: t("task.finish") }).click();
  await page.getByRole("button", { name: t("task.confirmYes") }).click();
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
  expect((await prisma.participant.findUniqueOrThrow({ where: { id: real.id } })).language).toBe(LANG);
  const realTrials = await prisma.comparisonTrial.findMany({ where: { sessionId: sessionA.id } });
  expect(realTrials.every((r) => r.language === LANG && r.scene !== "")).toBe(true);

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
  console.log(`Plans vs truth: ${(await page.getByText(/matched each simulated/).innerText()).trim()}`);

  const frozen = await prisma.frozenModel.findFirstOrThrow({ where: { status: "active" } });
  expect(frozen.computeMs).toBeGreaterThan(0);
  console.log(`Freeze: ${frozen.computeMs} ms for ${SIMULATED + 1} participants`);
  const results = frozen.results as unknown as FrozenResult[];
  const tally: Record<string, number> = {};
  for (const r of results)
    for (const [name, on] of [
      ["agent mismatch", r.flags.agentMismatch],
      ["identical targets", r.flags.identicalTargets.length > 0],
      ["equals global", r.flags.equalsGlobal.length > 0],
      ["near-tie", r.flags.nearTie.length > 0],
    ] as const)
      if (on) tally[name] = (tally[name] ?? 0) + 1;
  console.log(`Plan flags (participants): ${JSON.stringify(tally)}`);
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
  await expect(shop.getByRole("heading", { name: t("sb.welcome.title") })).toBeVisible({ timeout: 30_000 });
  await expect(shop.locator("html")).toHaveAttribute("dir", LANG === "ur" ? "rtl" : "ltr");
  await shop.getByRole("button", { name: t("sb.welcome.start") }).click();
  await expect(shop.getByText(t("sb.practiceBadge"), { exact: true })).toBeVisible();
  await shop.getByRole("button", { name: trRe(LANG, "shop.addItem") }).first().click();
  await finishTask(shop);

  const blocks = await prisma.taskBlock.findMany({ where: { sessionId: sessionB.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
  for (const block of blocks) {
    await expect(shop.getByText(t("sb.intro.taskOf", { number: block.blockIndex + 1, total: 4 }))).toBeVisible();
    await shop.getByRole("button", { name: t("sb.intro.start") }).click();
    await expect(shop.getByRole("button", { name: t("task.finish") })).toBeVisible();
    await expect(shop.locator(".shop")).toHaveAttribute("data-config-id", "standard-standard-flat-iconOnly-standard-grid3-none");
    await expect(shop.locator(".shop")).toHaveAttribute("dir", LANG === "ur" ? "rtl" : "ltr");
    const adds = shop.getByRole("button", { name: trRe(LANG, "shop.addItem") });
    await adds.nth(0).click();
    await adds.nth(1).click();
    await adds.nth(2).click();
    const target = mine.targets[block.condition as keyof typeof mine.targets];
    await expect(shop.locator(".shop")).toHaveAttribute("data-config-id", target, { timeout: 20_000 });
    await finishTask(shop);
    await answerQuestionnaire(shop, instrumentTitle("quis"));
    await answerQuestionnaire(shop, instrumentTitle("ues_sf"));
  }
  await expect(shop.getByRole("heading", { name: t("rank.title") })).toBeVisible();
  await shop.getByRole("button", { name: t("rank.submit") }).click();
  await expect(shop.getByRole("heading", { name: t("end.title") })).toBeVisible();
  expect((await prisma.session.findUniqueOrThrow({ where: { id: sessionB.id } })).language).toBe(LANG);
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
