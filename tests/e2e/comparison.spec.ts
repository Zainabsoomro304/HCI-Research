import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/db";
import { chooseLanguage, comparisonToken, doConsent, doConsentAndBackground, fastVideos, newParticipant, runComparisons, tr } from "./helpers";

test("a scripted participant completes a full comparison session", async ({ page }) => {
  const p = await newParticipant();
  const token = comparisonToken(p);
  await fastVideos(page);
  await page.goto(`/s/${token}`);
  await doConsentAndBackground(page);
  expect(await runComparisons(page)).toBe(2);
  await expect(page.getByText(tr("en")("end.comparison"))).toBeVisible();
  await expect(page.getByTestId("participant-code")).toHaveText(p.code);

  const session = await prisma.session.findUnique({ where: { token }, include: { trials: true, breaks: true, consent: true } });
  expect(session!.status).toBe("completed");
  expect(session!.language).toBe("en");
  expect(session!.consent).not.toBeNull();
  expect(session!.trials.filter((t) => t.choice)).toHaveLength(84);
  for (const t of session!.trials.filter((t) => !t.isPractice)) {
    // Choosing is allowed as soon as the clips start; RT (from both clips ending) is empty for an earlier choice.
    expect(t.clientRespondedAt!.getTime()).toBeGreaterThanOrEqual(t.clientShownAt!.getTime());
    if (t.clientBothEndedAt) {
      expect(t.rtMs).not.toBeNull();
      expect(t.clientBothEndedAt.getTime()).toBeGreaterThanOrEqual(t.clientShownAt!.getTime());
    } else expect(t.rtMs).toBeNull();
    expect(t.language).toBe("en");
  }
  for (const t of session!.trials.filter((t) => t.isAttentionCheck)) expect(t.choice).toBe("right");
  expect(session!.breaks.every((b) => b.durationMs !== null)).toBe(true);
  await expect.poll(() => prisma.event.count({ where: { sessionId: session!.id, type: "trial_shown" } })).toBeGreaterThanOrEqual(84);
});

test("someone under 40 sees a polite not-eligible page and only the screening result is kept", async ({ page }) => {
  const p = await newParticipant();
  const token = p.sessions.find((s) => s.type === "comparison")!.token;
  await page.goto(`/s/${token}`);
  await chooseLanguage(page, "en");
  await doConsent(page, "en");
  await page.locator("#q-age input").fill("35");
  await page.getByRole("button", { name: tr("en")("bg.submit") }).click();
  await expect(page.getByRole("heading", { name: tr("en")("eligibility.title") })).toBeVisible();
  const responses = await prisma.questionnaireResponse.findMany({ where: { participantId: p.id } });
  expect(responses.map((r) => [r.instrument, r.responses])).toEqual([["screening", { age: 35, eligible: false }]]);
  expect((await prisma.participant.findUnique({ where: { id: p.id } }))!.withdrawnAt).not.toBeNull();
  // Reloading keeps the not-eligible page.
  await page.reload();
  await expect(page.getByRole("heading", { name: tr("en")("eligibility.title") })).toBeVisible();
});

test("phones are turned away with a clear message", async ({ browser }) => {
  const p = await newParticipant();
  const token = p.sessions.find((s) => s.type === "comparison")!.token;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`/s/${token}`);
  await expect(page.getByRole("heading", { name: tr("en")("common.deviceTooSmall.title") })).toBeVisible();
  await ctx.close();
});
