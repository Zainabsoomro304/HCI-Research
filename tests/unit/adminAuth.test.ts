import { beforeAll, describe, expect, it } from "vitest";
import { createAdminToken, passwordMatches, verifyAdminToken } from "@/lib/admin/auth";

beforeAll(() => {
  process.env.SESSION_SECRET = "unit-test-secret-unit-test-secret";
  process.env.ADMIN_PASSWORD = "correct horse";
});

describe("admin auth", () => {
  it("accepts a fresh token and rejects tampered or expired ones", async () => {
    const t = await createAdminToken();
    expect(await verifyAdminToken(t)).toBe(true);
    expect(await verifyAdminToken(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe(false);
    const [exp, sig] = t.split(".");
    expect(await verifyAdminToken(`${Number(exp) + 1000}.${sig}`)).toBe(false);
    const old = await createAdminToken(Date.now() - 13 * 3600_000);
    expect(await verifyAdminToken(old)).toBe(false);
    expect(await verifyAdminToken(undefined)).toBe(false);
  });
  it("compares passwords exactly", () => {
    expect(passwordMatches("correct horse")).toBe(true);
    expect(passwordMatches("correct hors")).toBe(false);
    expect(passwordMatches("")).toBe(false);
  });
});
