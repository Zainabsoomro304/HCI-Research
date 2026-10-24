import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { mediaRewrites } from "./src/lib/media";

/** All 108 config IDs (kept local: next.config cannot use the @/ path alias). */
const LEVELS = [
  ["list", "grid2", "grid3"],
  ["small", "default", "large"],
  ["detailed", "partial", "summary"],
  ["light", "dark"],
  ["sidebar", "dropdown"],
];
const ALL_IDS = LEVELS.reduce<string[]>((acc, levels) => acc.flatMap((p) => levels.map((l) => (p ? `${p}-${l}` : l))), [""]);

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
  // The E2E test server uses its own build directory so it can run next to `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return mediaRewrites(ALL_IDS);
  },
};

export default nextConfig;
