/** Helpers for scripts that need a running app: reuse BASE_URL if it responds, otherwise start `next dev`. */
import { spawn, type ChildProcess } from "node:child_process";

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
