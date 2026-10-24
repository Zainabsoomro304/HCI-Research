/**
 * pnpm clips:select — chooses the 32 analysis clip targets (and 4 practice clips) from the 108 configurations.
 *
 * Balance: every level of every setting appears as evenly as possible, AND the number of settings that change
 * from the base config (transition busyness) is balanced across 2 / 3 / 4 changes. Clips changing only 1 or
 * all 5 settings are excluded. The base configuration is never a target. Writes data/clips.json.
 *
 * Options: --seed=<n> (default 20261025)
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG_ID, SETTING_KEYS, numChangedSettings, toConfigId } from "@/config/uiSpace";
import { CLIP_SET, type ClipsFile } from "@/lib/clipsFile";
import { selectBalancedClips, spread } from "@/lib/clipSelection";

const seedArg = process.argv.find((a) => a.startsWith("--seed="))?.split("=")[1];
const seed = seedArg ? Number(seedArg) : CLIP_SET.defaultSeed;

const main = selectBalancedClips({ size: CLIP_SET.analysisClips, allowedChanges: CLIP_SET.allowedChanges, seed });
const problems: string[] = [];
for (const k of SETTING_KEYS) if (spread(main.levelCounts[k]) > 1) problems.push(`setting "${k}" is not balanced`);
if (spread(main.changeCounts) > 1) problems.push("number of changed settings is not balanced");

// Practice clips: distinct from the analysis set, same allowed busyness, levels spread as evenly as possible.
const practice = selectBalancedClips({
  size: CLIP_SET.practiceClips,
  allowedChanges: CLIP_SET.allowedChanges,
  seed: seed + 1,
  exclude: main.configs.map(toConfigId),
  restarts: 20,
  iterations: 2000,
});

const file: ClipsFile = {
  version: 1,
  seed,
  baseConfigId: DEFAULT_CONFIG_ID,
  allowedChanges: [...CLIP_SET.allowedChanges],
  clips: main.configs.map((c) => ({ id: toConfigId(c), numChangedSettings: numChangedSettings(c) })),
  practiceClips: practice.configs.map((c) => ({ id: toConfigId(c), numChangedSettings: numChangedSettings(c) })),
};

console.log(`Selected ${file.clips.length} analysis clips (seed ${seed}, base ${DEFAULT_CONFIG_ID})\n`);
console.log("Level counts:");
for (const k of SETTING_KEYS)
  console.log(`  ${k.padEnd(9)} ${Object.entries(main.levelCounts[k]).map(([l, n]) => `${l}=${n}`).join("  ")}`);
console.log("\nNumber of settings changed from the base (transition busyness):");
for (const [n, count] of Object.entries(main.changeCounts)) console.log(`  ${n} changed: ${"#".repeat(count)} ${count}`);
console.log("\nMean number of changed settings per level (a clip keeping the base level has one fewer change by construction):");
for (const k of SETTING_KEYS) {
  const parts = Object.keys(main.levelCounts[k]).map((l) => {
    const xs = main.configs.filter((c) => c[k] === l).map((c) => numChangedSettings(c));
    return `${l}=${(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)}`;
  });
  console.log(`  ${k.padEnd(9)} ${parts.join("  ")}`);
}
console.log(`\nPractice clips:${file.practiceClips.map((c) => `${c.id} (${c.numChangedSettings})`).join(", ")}`);
console.log(`Optimiser cost: ${main.cost.toFixed(2)}`);

if (problems.length) {
  console.error(`\nBALANCE FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
const out = path.resolve("data/clips.json");
fs.writeFileSync(out, JSON.stringify(file, null, 2) + "\n");
console.log(`\nWrote ${path.relative(process.cwd(), out)}`);
