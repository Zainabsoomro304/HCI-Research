/**
 * Does each real participant's stored comparison session match the current protocol? The schedule is regenerated
 * from the participant's seed with today's clip set, design (70 main + 10 repeats, 2 practice) and scenes, then compared
 * trial by trial with what is stored: order, clips, scenes, practice/repeat/attention flags and repeat sources. A session
 * that matches a known earlier design (EARLIER_COMPARISON_DESIGNS, e.g. the 82-trial version with 2 attention checks)
 * also counts as matching, and the result says which version. Their answers are never read or changed.
 *
 * Read-only plain SQL, so it works before and after the one-group migration. With --apply-flags (after the migration
 * only) it sets Participant.protocol = 'earlier-version' for participants who do not match, and nothing else.
 */
import { PrismaClient } from "@prisma/client";
import rawClips from "@data/clips.json";
import { CLIP_SCENES } from "@/config/shop";
import { COMPARISON_DESIGN, EARLIER_COMPARISON_DESIGNS, type ComparisonDesign } from "@/config/study";
import { parseClipsFile } from "@/lib/clipsFile";
import { generateSchedule } from "@/lib/schedule";

type TrialRow = {
  sessionId: string;
  seq: number;
  trialIndex: number;
  isPractice: boolean;
  isRepeat: boolean;
  isAttentionCheck: boolean;
  repeatOfTrialId: string | null;
  id: string;
  leftClipId: string;
  rightClipId: string;
  scene: string;
  language: string;
};

export interface ProtocolResult {
  code: string;
  trials: number;
  matches: boolean;
  /** Which design each stored session matched ("current" or an earlier design's label). */
  versions: string[];
  differences: string[];
}

const DESIGNS: { label: string; design: ComparisonDesign }[] = [{ label: "current", design: COMPARISON_DESIGN }, ...EARLIER_COMPARISON_DESIGNS];

function scheduleDifferences(trials: TrialRow[], design: ComparisonDesign, seed: number, lang: string, clipsFile: ReturnType<typeof parseClipsFile>): string[] {
  const differences: string[] = [];
  const expected = generateSchedule({
    clips: clipsFile.clips.map((c) => c.id),
    practiceClips: clipsFile.practiceClips.map((c) => c.id),
    design,
    seed,
    scenes: CLIP_SCENES,
  });
  if (expected.length !== trials.length) differences.push(`${trials.length} trials stored, the current protocol schedules ${expected.length}`);
  const seqOf = new Map(trials.map((t) => [t.id, t.seq]));
  for (let i = 0; i < Math.min(expected.length, trials.length); i++) {
    const e = expected[i]!;
    const t = trials[i]!;
    const fields: [string, unknown, unknown][] = [
      ["seq", t.seq, e.seq],
      ["trialIndex", t.trialIndex, e.trialIndex],
      ["isPractice", t.isPractice, e.isPractice],
      ["isRepeat", t.isRepeat, e.isRepeat],
      ["isAttentionCheck", t.isAttentionCheck, e.isAttentionCheck],
      ["repeatOf", t.repeatOfTrialId ? seqOf.get(t.repeatOfTrialId) : null, e.repeatOfSeq],
      ["left", t.leftClipId, e.left],
      ["right", t.rightClipId, e.right],
      ["scene", t.scene, e.scene],
      ["language", t.language, lang],
    ];
    for (const [name, stored, want] of fields)
      if (stored !== want) differences.push(`trial seq ${t.seq}: ${name} is ${String(stored)}, current protocol gives ${String(want)}`);
  }
  return differences;
}

export async function protocolResults(prisma: PrismaClient): Promise<ProtocolResult[]> {
  const clipsFile = parseClipsFile(rawClips);
  const people = await prisma.$queryRawUnsafe<{ id: string; code: string; seed: number; language: string }[]>(
    `SELECT id, code, seed, language FROM "Participant" WHERE "isSimulated" = false ORDER BY "createdAt", id`,
  );
  const out: ProtocolResult[] = [];
  for (const p of people) {
    const sessions = await prisma.$queryRawUnsafe<{ id: string; language: string | null }[]>(
      `SELECT id, language FROM "Session" WHERE "participantId" = $1 AND type::text IN ('phase1','p3_sessionA','comparison')`,
      p.id,
    );
    const differences: string[] = [];
    const versions: string[] = [];
    let count = 0;
    for (const s of sessions) {
      const trials = await prisma.$queryRawUnsafe<TrialRow[]>(
        `SELECT id, "sessionId", seq, "trialIndex", "isPractice", "isRepeat", "isAttentionCheck", "repeatOfTrialId", "leftClipId", "rightClipId", scene, language FROM "ComparisonTrial" WHERE "sessionId" = $1 ORDER BY seq`,
        s.id,
      );
      count += trials.length;
      if (trials.length === 0) continue; // schedule not generated yet: it will be generated with the current protocol
      let best: string[] | null = null;
      for (const { label, design } of DESIGNS) {
        const diff = scheduleDifferences(trials, design, p.seed, s.language ?? p.language, clipsFile);
        if (diff.length === 0) {
          versions.push(label);
          best = [];
          break;
        }
        if (label === "current") best = diff;
      }
      differences.push(...best!);
    }
    out.push({
      code: p.code,
      trials: count,
      matches: differences.length === 0,
      versions,
      differences,
    });
  }
  return out;
}

export async function checkProtocol(): Promise<boolean> {
  const apply = process.argv.includes("--apply-flags");
  const prisma = new PrismaClient();
  try {
    const results = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        return protocolResults(tx as unknown as PrismaClient);
      },
      { maxWait: 30_000, timeout: 300_000 },
    ); // schedules are regenerated per person and design: slow over a remote link
    for (const r of results) {
      console.log(
        `${r.code}: ${r.trials} stored trials, ${r.matches ? `MATCHES (${[...new Set(r.versions)].join(", ") || "no schedule yet"})` : `DIFFERS (${r.differences.length} difference(s))`}`,
      );
      for (const d of r.differences.slice(0, 10)) console.log(`    ${d}`);
    }
    const differing = results.filter((r) => !r.matches);
    if (apply && differing.length) {
      const n = await prisma.$executeRawUnsafe(
        `UPDATE "Participant" SET protocol = 'earlier-version' WHERE "isSimulated" = false AND code = ANY($1::text[])`,
        differing.map((r) => r.code),
      );
      console.log(`Flagged ${n} participant(s) as protocol = earlier-version.`);
    }
    console.log(
      differing.length
        ? `${differing.length} of ${results.length} participant(s) match no known protocol version.`
        : `All ${results.length} participant(s) match the current or a known earlier protocol version.`,
    );
    return true;
  } finally {
    await prisma.$disconnect();
  }
}
