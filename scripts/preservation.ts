/**
 * Preservation of existing (real, non-simulated) participants across the move to the one-group design.
 *
 *   pnpm preserve snapshot <out.json>     Read-only. Every column of every record of every real participant.
 *   pnpm preserve compare <before.json>   Read-only. Compares the current database with a snapshot, field by field.
 *                                         Fails (exit 1) on any difference other than the documented migration changes.
 *   pnpm preserve protocol                Read-only. Checks each real participant's stored comparison schedule
 *                                         against the current protocol (settings, clip set, trial counts, scenes, language).
 *
 * Runs on the old and the new schema alike (plain SQL, row_to_json), so the same tool reads before and after the migration.
 * The snapshot holds participant data: write it OUTSIDE the git repository.
 *
 * The only changes the migration may make to existing records (everything else must be byte-identical):
 *   Participant  code -> P-xxx (the old code moves to legacyCode), number renumbered, studyPhase removed,
 *                new columns legacyCode (= old code) and protocol ("current" unless the protocol check flags it).
 *   Session      type phase1 / p3_sessionA -> comparison, p3_sessionB -> shopping. New, unused shopping sessions may be
 *                added for participants who did not have one.
 *   QuestionnaireResponse  new column score, which must stay empty for existing answers.
 */
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

type Row = Record<string, unknown>;
type Snapshot = { takenAt: string; database: string; participants: string[]; tables: Record<string, Row[]> };

const CHILD_TABLES = ["Session", "ConsentRecord", "QuestionnaireResponse", "ComparisonTrial", "BreakRecord", "TaskBlock", "AdaptationPlan", "Ranking", "Event"] as const;
const SESSION_TYPE_MAP: Record<string, string> = { phase1: "comparison", p3_sessionA: "comparison", p3_sessionB: "shopping", comparison: "comparison", shopping: "shopping" };

function dbLabel(): string {
  const url = process.env.DATABASE_URL ?? "";
  const m = url.match(/@([^/:?]+)(?::\d+)?\/([^?]+)/);
  return m ? `${m[1]}/${m[2]}` : "unknown";
}

async function readOnly<T>(fn: (p: PrismaClient) => Promise<T>): Promise<T> {
  const p = new PrismaClient();
  try {
    return await p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return fn(tx as unknown as PrismaClient);
    }, { timeout: 120_000, maxWait: 30_000 });
  } finally {
    await p.$disconnect();
  }
}

async function rows(tx: PrismaClient, sql: string): Promise<Row[]> {
  const out = await tx.$queryRawUnsafe<{ j: string }[]>(`select row_to_json(t)::text as j from (${sql}) t`);
  return out.map((r) => JSON.parse(r.j) as Row).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export async function takeSnapshot(): Promise<Snapshot> {
  return readOnly(async (tx) => {
    const participants = await rows(tx, `select * from "Participant" where "isSimulated" = false`);
    const ids = participants.map((p) => `'${String(p.id).replace(/'/g, "''")}'`).join(",") || "''";
    const tables: Record<string, Row[]> = { Participant: participants };
    for (const t of CHILD_TABLES) tables[t] = await rows(tx, `select * from "${t}" where "participantId" in (${ids})`);
    return { takenAt: new Date().toISOString(), database: dbLabel(), participants: participants.map((p) => String(p.legacyCode ?? p.code)), tables };
  });
}

/** Compares two snapshots under the migration rules. Returns the differences (empty = identical). */
export function compareSnapshots(before: Snapshot, after: Snapshot): string[] {
  const diffs: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const table of ["Participant", ...CHILD_TABLES]) {
    const b = new Map((before.tables[table] ?? []).map((r) => [String(r.id), r]));
    const a = new Map((after.tables[table] ?? []).map((r) => [String(r.id), r]));
    for (const [id, old] of b) {
      const now = a.get(id);
      if (!now) {
        diffs.push(`${table} ${id}: record missing after the migration`);
        continue;
      }
      for (const col of new Set([...Object.keys(old), ...Object.keys(now)])) {
        const was = old[col];
        const is = now[col];
        if (table === "Participant") {
          if (col === "studyPhase" && !(col in now)) continue;
          if (col === "number") continue;
          if (col === "code") {
            if (!/^P-\d{3,}$/.test(String(is))) diffs.push(`Participant ${id}: new code ${String(is)} is not in the P-xxx format`);
            continue;
          }
          if (col === "legacyCode" && !(col in old)) {
            if (is !== old.code) diffs.push(`Participant ${id}: legacyCode is ${String(is)}, expected the old code ${String(old.code)}`);
            continue;
          }
          if (col === "protocol" && !(col in old)) {
            if (is !== "current" && is !== "earlier-version") diffs.push(`Participant ${id}: unexpected protocol value ${String(is)}`);
            continue;
          }
        }
        if (table === "Session" && col === "type") {
          if (SESSION_TYPE_MAP[String(was)] !== is) diffs.push(`Session ${id}: type ${String(was)} became ${String(is)}, expected ${SESSION_TYPE_MAP[String(was)]}`);
          continue;
        }
        if (table === "QuestionnaireResponse" && col === "score" && !(col in old)) {
          if (is !== null) diffs.push(`QuestionnaireResponse ${id}: score was set to ${String(is)} on an existing answer`);
          continue;
        }
        if (!same(was, is)) diffs.push(`${table} ${id}.${col}: ${JSON.stringify(was)} -> ${JSON.stringify(is)}`);
      }
    }
    for (const [id, now] of a) {
      if (b.has(id)) continue;
      // The only records the migration may add: an unused shopping session for an existing participant.
      const ok = table === "Session" && now.type === "shopping" && now.status === "not_started" && now.startedAt === null && now.unlockedAt === null;
      if (!ok) diffs.push(`${table} ${id}: new record that was not there before`);
    }
  }
  return diffs;
}

async function main() {
  const [command, file] = process.argv.slice(2);
  if (command === "snapshot") {
    if (!file) throw new Error("usage: preserve snapshot <out.json>");
    const snap = await takeSnapshot();
    fs.writeFileSync(file, JSON.stringify(snap, null, 1));
    const count = (t: string) => snap.tables[t]?.length ?? 0;
    console.log(`Snapshot of ${snap.database} at ${snap.takenAt}: ${snap.participants.length} real participants (${snap.participants.join(", ")}), ${count("Session")} sessions, ${count("ComparisonTrial")} trials, ${count("Event")} events -> ${file}`);
    return;
  }
  if (command === "compare") {
    if (!file) throw new Error("usage: preserve compare <before.json>");
    const before = JSON.parse(fs.readFileSync(file, "utf8")) as Snapshot;
    const after = await takeSnapshot();
    const diffs = compareSnapshots(before, after);
    const fields = Object.entries(before.tables).reduce((n, [, rs]) => n + rs.reduce((m, r) => m + Object.keys(r).length, 0), 0);
    console.log(`Compared ${before.database} (snapshot ${before.takenAt}) with ${after.database} now: ${before.participants.length} participants, ${Object.values(before.tables).reduce((n, r) => n + r.length, 0)} records, ${fields} fields.`);
    if (diffs.length) {
      console.log(`FAILED: ${diffs.length} difference(s):`);
      for (const d of diffs.slice(0, 200)) console.log(`  ${d}`);
      process.exit(1);
    }
    const added = after.tables.Session!.length - before.tables.Session!.length;
    console.log(`PASSED: every recorded answer, choice, timing, flag and timestamp is identical. Added: ${added} unused shopping session(s). Codes: ${after.tables.Participant!.map((p) => `${String(p.legacyCode)} -> ${String(p.code)}`).join(", ")}`);
    return;
  }
  if (command === "protocol") {
    const { checkProtocol } = await import("./lib/protocolCheck");
    const ok = await checkProtocol();
    if (!ok) process.exit(1);
    return;
  }
  throw new Error("usage: preserve snapshot|compare|protocol");
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/preservation.ts");
if (isMain)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
