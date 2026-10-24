/**
 * E2E global setup: fresh embedded PostgreSQL (port 54331) + schema, then a Next dev server on the E2E port
 * pointed at it. Returns a teardown that stops both.
 */
import { execSync, spawn } from "node:child_process";
import path from "node:path";
import { startLocalDb } from "../../scripts/local-db";

const PORT = 3210;

async function waitFor(url: string, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export default async function globalSetup() {
  const { pg, url } = await startLocalDb({ dataDir: path.resolve(".pgdata-e2e"), fresh: true, port: 54331 });
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  process.env.ADMIN_PASSWORD = "e2e-admin";
  process.env.SESSION_SECRET = "e2e-secret-e2e-secret-e2e-secret-1234";
  process.env.PUBLIC_BASE_URL = `http://localhost:${PORT}`;
  execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", { stdio: "ignore", env: process.env });
  // Separate build directory so the E2E server never clashes with a running `pnpm dev`.
  const server = spawn("pnpm", ["exec", "next", "dev", "--port", String(PORT)], {
    env: { ...process.env, NEXT_DIST_DIR: ".next-e2e" },
    shell: true,
    stdio: "ignore",
  });
  await waitFor(`http://localhost:${PORT}/`, 180_000);
  // Warm up routes (first compile is slow in dev).
  await fetch(`http://localhost:${PORT}/s/warmup000000`).catch(() => undefined);
  return async () => {
    try {
      if (server.pid) {
        if (process.platform === "win32") execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
        else server.kill("SIGTERM");
      }
    } catch {
      // already exited
    } finally {
      await pg.stop();
    }
  };
}
