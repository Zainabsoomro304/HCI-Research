/** Vitest global setup for integration tests: a fresh embedded PostgreSQL with the Prisma schema pushed. */
import { execSync } from "node:child_process";
import path from "node:path";
import { startLocalDb } from "../../scripts/local-db";

export default async function setup() {
  const port = 54330;
  const { pg, url } = await startLocalDb({ dataDir: path.resolve(".pgdata-test"), fresh: true, port });
  process.env.DATABASE_URL = url;
  process.env.DIRECT_URL = url;
  // Fictional researcher details, so the consent form is complete (content/study-info.json stays empty in the repo).
  process.env.STUDY_INFO_FILE = path.resolve("tests/fixtures/study-info.example.json");
  execSync("pnpm exec prisma db push --skip-generate --accept-data-loss", { stdio: "ignore", env: process.env });
  return async () => {
    await pg.stop();
  };
}
