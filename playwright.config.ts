import { defineConfig } from "@playwright/test";

/** Port for the Next server started by tests/e2e/global-setup.ts (separate from `pnpm dev`). */
const E2E_PORT = 3210;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
});
