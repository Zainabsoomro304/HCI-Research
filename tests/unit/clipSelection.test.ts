import { describe, expect, it } from "vitest";
import rawClips from "@data/clips.json";
import { DEFAULT_CONFIG_ID, SETTING_KEYS, fromConfigId, numChangedSettings, toConfigId } from "@/config/uiSpace";
import { selectBalancedClips, spread } from "@/lib/clipSelection";
import { CLIP_SET, parseClipsFile } from "@/lib/clipsFile";
import { createRng } from "@/lib/random";

describe("balanced clip selection", () => {
  const result = selectBalancedClips({ size: 32, allowedChanges: [2, 3, 4], seed: 7, restarts: 10 });

  it("selects 32 unique targets, never the base config", () => {
    const ids = result.configs.map(toConfigId);
    expect(new Set(ids).size).toBe(32);
    expect(ids).not.toContain(DEFAULT_CONFIG_ID);
  });

  it("balances every level of every setting (max - min <= 1)", () => {
    for (const k of SETTING_KEYS) expect(spread(result.levelCounts[k]), k).toBeLessThanOrEqual(1);
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
