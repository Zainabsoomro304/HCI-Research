import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/db";
import { answerTrial, currentTrial, doConsentAndBackground, fastVideos, newParticipant } from "./helpers";

test("resumes exactly where the participant stopped after closing the browser", async ({ browser }) => {
  const p = await newParticipant(1);
  const token = p.sessions[0]!.token;

  const ctx1 = await browser.newContext();
  const page1 = await ctx1.newPage();
  await fastVideos(page1);
  await page1.goto(`/s/${token}`);
  await doConsentAndBackground(page1);
  await page1.getByRole("button", { name: "Start practice" }).click();
  await answerTrial(page1, "A");
  await answerTrial(page1, "B");
  await page1.getByRole("button", { name: "Start" }).click();
  for (let i = 1; i <= 7; i++) {
    await expect(page1.getByText(`Trial ${i} of 82`)).toBeVisible();
    await answerTrial(page1, "A");
  }
  await expect(page1.getByText("Trial 8 of 82")).toBeVisible();
  await ctx1.close(); // participant closes the browser mid-session

  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await fastVideos(page2);
  await page2.goto(`/s/${token}`);
  await expect(page2.getByText("Trial 8 of 82")).toBeVisible();
  expect(await currentTrial(page2)).toEqual({ practice: false, index: 8 });
  await answerTrial(page2, "B");
  await expect(page2.getByText("Trial 9 of 82")).toBeVisible();
  // Reloading mid-trial shows the same trial again: nothing skipped, nothing duplicated.
  await page2.reload();
  await expect(page2.getByText("Trial 9 of 82")).toBeVisible();
  await ctx2.close();

  expect(await prisma.comparisonTrial.count({ where: { session: { token }, choice: { not: null } } })).toBe(2 + 8);
});
