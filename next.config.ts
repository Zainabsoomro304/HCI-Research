import type { NextConfig } from "next";
import { execSync } from "node:child_process";

/** The exact build a participant used: git commit hash, injected at build/dev-start time. */
function resolveAppVersion(): string {
  const fromHost = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? process.env.APP_VERSION;
  if (fromHost) return fromHost;
  try {
    const hash = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return dirty ? `${hash}-dirty` : hash;
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: { APP_VERSION: resolveAppVersion() },
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
