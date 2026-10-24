/**
 * Starts a throwaway local PostgreSQL server (embedded binaries, no install needed).
 * Used by the automated tests; also handy for offline development.
 *
 *   pnpm db:local            -> runs until Ctrl+C, data kept in .pgdata/
 *   pnpm db:local --fresh    -> wipes .pgdata/ first
 *
 * Then use DATABASE_URL=DIRECT_URL=postgresql://postgres:postgres@localhost:54329/adaptive_ui
 */
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

export const LOCAL_DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);
export const LOCAL_DB_NAME = "adaptive_ui";
export const LOCAL_DB_URL = `postgresql://postgres:postgres@localhost:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}`;

export async function startLocalDb(opts: { dataDir: string; fresh?: boolean; port?: number }) {
  const port = opts.port ?? LOCAL_DB_PORT;
  if (opts.fresh && fs.existsSync(opts.dataDir)) fs.rmSync(opts.dataDir, { recursive: true, force: true });
  const isNew = !fs.existsSync(path.join(opts.dataDir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user: "postgres",
    password: "postgres",
    port,
    persistent: true,
    onLog: () => {},
  });
  if (isNew) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(LOCAL_DB_NAME);
  } catch {
    // already exists
  }
  return { pg, url: `postgresql://postgres:postgres@localhost:${port}/${LOCAL_DB_NAME}` };
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect(port, "127.0.0.1");
    sock.once("connect", () => (sock.destroy(), resolve(true)));
    sock.once("error", () => resolve(false));
  });
}

async function main() {
  if (await portInUse(LOCAL_DB_PORT)) {
    console.log(`Something is already listening on port ${LOCAL_DB_PORT} (probably the local database).
  DATABASE_URL="${LOCAL_DB_URL}"`);
    return;
  }
  const { pg, url } = await startLocalDb({ dataDir: path.resolve(".pgdata"), fresh: process.argv.includes("--fresh") });
  console.log(`Local PostgreSQL running.
  DATABASE_URL="${url}"
  DIRECT_URL="${url}"
Press Ctrl+C to stop.`);
  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).includes("local-db");
if (isMain) {
  main().catch((e: unknown) => {
    console.error("Could not start the local database:", e instanceof Error ? e.message : JSON.stringify(e));
    process.exit(1);
  });
}
