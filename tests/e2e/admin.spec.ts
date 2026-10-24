import JSZip from "jszip";
import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/db";
import { TABLES } from "@/lib/export/tables";

test("admin: login, create participants, upload a plan, start Session B, export ZIP", async ({ page }) => {
  // Protected pages redirect to the login form.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  expect((await page.request.get("/api/admin/monitor")).status()).toBe(401);

  await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled(); // hydrated
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Wrong password.")).toBeVisible();
  await page.getByLabel("Password").fill("e2e-admin");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Create participants" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create participants" })).toBeEnabled();

  // Bulk-create two Phase 3 participants.
  await page.getByLabel("Phase").selectOption("3");
  await page.getByLabel("How many").fill("2");
  await page.getByRole("button", { name: "Create participants" }).click();
  await expect(page.getByText(/Created 2: P3-\d{3}/)).toBeVisible();
  const created = await prisma.participant.findMany({ where: { studyPhase: 3 }, orderBy: { number: "desc" }, take: 2 });
  const p = created[1]!;
  await expect(page.getByRole("link", { name: p.code })).toBeVisible();

  // Participant page: Session B is blocked until plans are uploaded.
  await page.getByRole("link", { name: p.code }).click();
  await expect(page.getByRole("heading", { name: p.code })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Start Session B" })).toBeDisabled();

  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ participantCode: p.code, conditions: { static: { steps: [] } } })) });
  await expect(page.getByText("The plan was not saved:")).toBeVisible();
  await expect(page.getByText(/conditions\.global/)).toBeVisible();

  const plan = {
    participantCode: p.code,
    conditions: {
      static: { steps: [] },
      global: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "grid2-default-partial-light-sidebar" }] },
      cluster5: { steps: [{ trigger: { type: "afterEvents", value: 5 }, config: "grid3-large-partial-dark-dropdown" }] },
      personalFull: { steps: [{ trigger: { type: "afterMs", value: 8000 }, config: "grid3-default-detailed-dark-dropdown" }] },
    },
  };
  await upload.setInputFiles({ name: "plan.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(plan)) });
  await expect(page.getByText("Plan uploaded and validated.")).toBeVisible();
  await expect(page.getByText("step 1: afterEvents 5")).toBeVisible();

  // Seed is editable before any session starts.
  await page.getByLabel(/^Seed/).fill("424242");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  expect((await prisma.participant.findUnique({ where: { id: p.id } }))!.seed).toBe(424242);

  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Start Session B" }).click();
  await (await popup).close();
  await expect(page.getByRole("link", { name: "Open Session B ↗" })).toBeVisible();
  const sb = await prisma.session.findFirst({ where: { participantId: p.id, type: "p3_sessionB" } });
  expect(sb!.unlockedAt).not.toBeNull();
  expect(await prisma.taskBlock.count({ where: { sessionId: sb!.id } })).toBe(5);

  // Live monitor renders.
  await page.goto("/admin/monitor");
  await expect(page.getByRole("heading", { name: "Live monitor" })).toBeVisible();

  // Export: ZIP with every CSV + codebook; headers match the codebook definitions.
  const res = await page.request.get("/api/admin/export?phase=3");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/zip");
  const zip = await JSZip.loadAsync(await res.body());
  expect(Object.keys(zip.files).sort()).toEqual([...TABLES.map((t) => t.file), "codebook.md"].sort());
  for (const t of TABLES) {
    const header = (await zip.file(t.file)!.async("string")).split("\n")[0];
    expect(header, t.file).toBe(t.columns.map((c) => c.name).join(","));
  }
  const comparisonHeader = (await zip.file("comparison_trials.csv")!.async("string")).split("\n")[0]!;
  for (const col of ["left_layout", "left_fontSize", "left_density", "left_theme", "left_menu", "left_numChangedSettings", "right_menu", "right_numChangedSettings"])
    expect(comparisonHeader.split(",")).toContain(col);
  const participantsCsv = await zip.file("participants.csv")!.async("string");
  expect(participantsCsv).toContain(p.code);
});
