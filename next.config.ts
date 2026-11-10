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
  // The E2E test server uses its own build directory so it can run next to `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  poweredByHeader: false,
  // Consent text and questionnaires are read from content/ at runtime; make sure serverless bundles include them.
  outputFileTracingIncludes: { "/**": ["./content/**/*"] },
  devIndicators: false,
  // Clips and stills are served as static files under hashed names (public/m/), so no rewrites are needed.
};

export default nextConfig;
