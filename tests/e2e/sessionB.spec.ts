import { expect, test, type Page } from "@playwright/test";
import { prisma } from "@/lib/db";
import { savePlanFile } from "@/lib/planStore";
import { unlockSessionB } from "@/lib/session/sessionB";
import { newParticipant } from "./helpers";

async function answerQuestionnaire(page: Page, heading: RegExp) {
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  for (const fs of await page.locator("fieldset").all()) {
    const opts = fs.locator("input[type=radio]");
    await opts.nth(Math.floor((await opts.count()) / 2)).check({ force: true });
  }
  await page.getByRole("button", { name: "Continue" }).click();
}

async function finishTask(page: Page) {
  await page.getByRole("button", { name: "Finish task" }).click();
  await page.getByRole("button", { name: "Yes, finish" }).click();
}

test("a complete Session B with an uploaded plan", async ({ page }) => {
  const p = await newParticipant(3);
  const sb = p.sessions.find((s) => s.type === "p3_sessionB")!;
  await page.goto(`/s/${sb.token}`);
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible(); // locked: waiting for the researcher

  const uploaded = await savePlanFile(p.id, {
    participantCode: p.code,
    conditions: {
      static: { steps: [] },
      global: { steps: [{ trigger: { type: "afterMs", value: 1500 }, config: "grid2-default-partial-light-sidebar" }] },
      cluster5: { steps: [{ trigger: { type: "afterEvents", value: 2 }, config: "grid3-large-partial-dark-dropdown" }] },
      personalFull: { steps: [{ trigger: { type: "afterMs", value: 1500 }, config: "grid3-default-detailed-dark-dropdown" }] },
    },
  });
  expect(uploaded.ok).toBe(true);
  await unlockSessionB(sb.id);
  // The waiting page notices the unlock by polling.
  await expect(page.getByRole("heading", { name: "Welcome to the second session" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Start practice task" }).click();
  await expect(page.getByText("Practice", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await finishTask(page);

  const blocks = await prisma.taskBlock.findMany({ where: { sessionId: sb.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
  for (const block of blocks) {
    await expect(page.getByText(`Task ${block.blockIndex + 1} of 4`)).toBeVisible();
    await page.getByRole("button", { name: "Start shopping" }).click();
    await expect(page.getByRole("button", { name: "Finish task" })).toBeVisible();
    const adds = page.getByRole("button", { name: "Add to cart" });
    await adds.nth(0).click();
    await adds.nth(1).click();
    await adds.nth(2).click();
    const steps = block.planSnapshot as { config: string }[];
    const expected = steps.at(-1)?.config ?? "list-default-detailed-light-sidebar";
    await expect(page.locator(".shop")).toHaveAttribute("data-config-id", expected, { timeout: 10_000 });
    await finishTask(page);
    await answerQuestionnaire(page, /Satisfaction with the interface/);
    await answerQuestionnaire(page, /Your experience/);
  }

  await expect(page.getByRole("heading", { name: "Compare the four shops" })).toBeVisible();
  await page.getByRole("button", { name: "Move Interface 3 up" }).click();
  await page.locator('[data-interface="4"]').dragTo(page.locator("ol li").first());
  await page.getByLabel("Interface 2: Why? (optional, one line)").fill("Easy to read");
  await expect(page.locator("ol li").first()).toHaveAttribute("data-interface", "4");
  await page.getByRole("button", { name: "Submit ranking" }).click();
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();

  const done = await prisma.taskBlock.findMany({ where: { sessionId: sb.id, isPractice: false }, orderBy: { blockIndex: "asc" } });
  for (const b of done) {
    expect(b.finishedAt).not.toBeNull();
    expect(b.totalSpent).toBeGreaterThan(0);
    expect(b.requiredItemsFound).not.toBeNull();
    expect(b.finalConfigId).toBe((b.planSnapshot as { config: string }[]).at(-1)?.config ?? "list-default-detailed-light-sidebar");
  }
  expect(await prisma.questionnaireResponse.count({ where: { sessionId: sb.id } })).toBe(8);
  const ranks = await prisma.ranking.findMany({ where: { sessionId: sb.id }, orderBy: { rank: "asc" } });
  expect(ranks.map((r) => r.blockIndex + 1)).toEqual([4, 1, 3, 2]);
  expect(ranks.find((r) => r.blockIndex === 1)!.reason).toBe("Easy to read");
  await expect
    .poll(() => prisma.event.count({ where: { sessionId: sb.id, type: "adaptation_applied" } }))
    .toBeGreaterThanOrEqual(3);
});
