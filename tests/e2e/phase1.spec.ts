import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/db";
import { answerTrial, doConsentAndBackground, fastVideos, newParticipant } from "./helpers";

test("a scripted participant completes a full Phase 1 session", async ({ page }) => {
  const p = await newParticipant(1);
  const token = p.sessions[0]!.token;
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

  let breaks = 0;
  for (let i = 1; i <= 82; i++) {
    await expect(page.getByText(`Trial ${i} of 82`)).toBeVisible();
    const chooseB = await page.getByText("For this trial, please choose B.").isVisible();
    await answerTrial(page, chooseB ? "B" : i % 3 === 0 ? "B" : "A");
    if (i === 27 || i === 54) {
      await expect(page.getByRole("heading", { name: "Take a short break" })).toBeVisible();
      breaks++;
      await page.getByRole("button", { name: "Continue" }).click();
    }
  }
  await expect(page.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  expect(await page.locator(".font-mono").innerText()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(breaks).toBe(2);

  const session = await prisma.session.findUnique({ where: { token }, include: { trials: true, breaks: true, consent: true } });
  expect(session!.status).toBe("completed");
  expect(session!.consent).not.toBeNull();
  expect(session!.trials.filter((t) => t.choice)).toHaveLength(84);
  for (const t of session!.trials.filter((t) => !t.isPractice)) {
    expect(t.rtMs).not.toBeNull();
    expect(t.clientBothEndedAt!.getTime()).toBeGreaterThanOrEqual(t.clientShownAt!.getTime());
  }
  for (const t of session!.trials.filter((t) => t.isAttentionCheck)) expect(t.choice).toBe("right");
  expect(session!.breaks.every((b) => b.durationMs !== null)).toBe(true);
  await expect.poll(() => prisma.event.count({ where: { sessionId: session!.id, type: "trial_shown" } })).toBeGreaterThanOrEqual(84);
});
