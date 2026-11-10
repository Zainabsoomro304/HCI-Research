/** Helpers for scripts that need a running app: reuse BASE_URL if it responds, otherwise start `next dev`. */
import { spawn, type ChildProcess } from "node:child_process";
import type { BrowserContext } from "@playwright/test";

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

export async function ensureServer(defaultUrl = process.env.BASE_URL ?? "http://localhost:3000"): Promise<{ url: string; stop: () => void }> {
  if (await reachable(defaultUrl)) return { url: defaultUrl, stop: () => {} };
  const port = 3123;
  const url = `http://localhost:${port}`;
  console.log(`No server at ${defaultUrl}; starting next dev on port ${port}...`);
  const child: ChildProcess = spawn("pnpm", ["exec", "next", "dev", "--port", String(port)], {
    stdio: "ignore",
    shell: true,
    env: process.env,
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await reachable(`${url}/preview`)) return { url, stop: () => killTree(child) };
    await new Promise((r) => setTimeout(r, 1000));
  }
  killTree(child);
  throw new Error("Timed out waiting for the dev server");
}

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

/**
 * /preview and /clip need an admin session on a production server (`next start`), which renders much faster than
 * `next dev`. This signs a session cookie with SESSION_SECRET from .env, so the scripts can use either server.
 */
export async function authorize(context: BrowserContext, url: string): Promise<void> {
  try {
    process.loadEnvFile?.(".env");
  } catch {
    // no .env: fine for next dev, where the tools are open
  }
  if (!process.env.SESSION_SECRET) return;
  const { ADMIN_COOKIE, createAdminToken } = await import("@/lib/admin/auth");
  const { hostname } = new URL(url);
  await context.addCookies([{ name: ADMIN_COOKIE, value: await createAdminToken(), domain: hostname, path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
}
