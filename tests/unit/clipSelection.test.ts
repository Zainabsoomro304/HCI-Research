import { describe, expect, it } from "vitest";
import rawClips from "@data/clips.json";
import { DEFAULT_CONFIG_ID, SETTING_KEYS, fromConfigId, numChangedSettings, toConfigId } from "@/config/uiSpace";
import { levelCounts, nonBaseSpread, selectBalancedClips, spread } from "@/lib/clipSelection";
import { CLIP_SET, parseClipsFile } from "@/lib/clipsFile";
import { createRng } from "@/lib/random";

describe("balanced clip selection", () => {
  const result = selectBalancedClips({ size: 32, allowedChanges: [2, 3, 4], seed: 7, restarts: 10 });

  it("selects 32 unique targets, never the base config", () => {
    const ids = result.configs.map(toConfigId);
    expect(new Set(ids).size).toBe(32);
    expect(ids).not.toContain(DEFAULT_CONFIG_ID);
  });

  // With 2-4 changes out of 7 settings, the base level of each setting is necessarily shown more often than any
  // single non-base level, so the selection balances the non-base levels against each other (all 10 of them).
  it("balances every non-base level across all settings (max - min <= 1) and uses each of them", () => {
    expect(nonBaseSpread(result.levelCounts)).toBeLessThanOrEqual(1);
    for (const k of SETTING_KEYS) for (const n of Object.values(result.levelCounts[k])) expect(n).toBeGreaterThan(0);
  });

  it("balances the number of changed settings across 2/3/4 and excludes 1 and 5", () => {
    expect(Object.keys(result.changeCounts).map(Number).sort()).toEqual([2, 3, 4]);
    expect(spread(result.changeCounts)).toBeLessThanOrEqual(1);
    for (const c of result.configs) expect([2, 3, 4]).toContain(numChangedSettings(c));
  });

  it("is reproducible for the same seed", () => {
    const again = selectBalancedClips({ size: 32, allowedChanges: [2, 3, 4], seed: 7, restarts: 10 });
    expect(again.configs.map(toConfigId)).toEqual(result.configs.map(toConfigId));
  });
});

describe("data/clips.json", () => {
  const file = parseClipsFile(rawClips);

  it("is valid, for the current base config, with 32 analysis and 4 practice clips", () => {
    expect(file.baseConfigId).toBe(DEFAULT_CONFIG_ID);
    expect(file.clips).toHaveLength(CLIP_SET.analysisClips);
    expect(file.practiceClips).toHaveLength(CLIP_SET.practiceClips);
  });

  it("stores the correct numChangedSettings for every clip", () => {
    for (const c of [...file.clips, ...file.practiceClips]) expect(c.numChangedSettings).toBe(numChangedSettings(fromConfigId(c.id)));
  });

  it("is balanced: changed settings 2/3/4 within 1 and non-base levels within 1", () => {
    const configs = file.clips.map((c) => fromConfigId(c.id));
    expect(nonBaseSpread(levelCounts(configs))).toBeLessThanOrEqual(1);
    const changes = { 2: 0, 3: 0, 4: 0 } as Record<number, number>;
    for (const c of configs) changes[numChangedSettings(c)]!++;
    expect(spread(changes)).toBeLessThanOrEqual(1);
  });

  it("rejects a file whose numChangedSettings is wrong", () => {
    const bad = structuredClone(rawClips);
    bad.clips[0]!.numChangedSettings = 5;
    expect(() => parseClipsFile(bad)).toThrow(/numChangedSettings/);
  });
});

describe("seeded rng", () => {
  it("produces identical sequences for identical seeds", () => {
    const a = createRng(123);
    const b = createRng(123);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
    expect(createRng(5).shuffle([1, 2, 3, 4, 5, 6])).toEqual(createRng(5).shuffle([1, 2, 3, 4, 5, 6]));
  });
});
