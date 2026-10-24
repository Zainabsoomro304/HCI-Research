import { defineConfig } from "vitest/config";
import base from "./vitest.config";

export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/setup/integration-db.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
