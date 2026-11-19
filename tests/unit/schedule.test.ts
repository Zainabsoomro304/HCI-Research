import { describe, expect, it } from "vitest";
import rawClips from "@data/clips.json";
import { CLIP_SCENES } from "@/config/shop";
import { COMPARISON_DESIGN, totalAnalysisTrials } from "@/config/study";
import { parseClipsFile } from "@/lib/clipsFile";
import { generateSchedule, type ScheduledTrial } from "@/lib/schedule";

const clipsFile = parseClipsFile(rawClips);
const clips = clipsFile.clips.map((c) => c.id);
const practiceClips = clipsFile.practiceClips.map((c) => c.id);
const design = COMPARISON_DESIGN;
const make = (seed: number) => generateSchedule({ clips, practiceClips, design, seed, scenes: CLIP_SCENES });

const SEEDS = [1, 2, 3, 42, 1234, 99991, 2026, 777777];
const pairKey = (t: ScheduledTrial) => [t.left, t.right].sort().join("|");

describe.each(SEEDS)("trial schedule (seed %i)", (seed) => {
  const s = make(seed);
  const analysis = s.filter((t) => !t.isPractice);
  const main = analysis.filter((t) => !t.isRepeat && !t.isAttentionCheck);
  const repeats = analysis.filter((t) => t.isRepeat);
  const attention = analysis.filter((t) => t.isAttentionCheck);

  it("has the right counts (2 practice + 70 main + 10 repeats + 2 attention = 84)", () => {
    expect(design).toMatchObject({ mainTrials: 70, repeatTrials: 10, attentionChecks: 2, practiceTrials: 2 });
    expect(totalAnalysisTrials(design)).toBe(82);
    expect(s).toHaveLength(84);
    expect(s.filter((t) => t.isPractice)).toHaveLength(2);
    expect(main).toHaveLength(70);
    expect(repeats).toHaveLength(10);
    expect(attention).toHaveLength(2);
    expect(s.map((t) => t.seq)).toEqual(s.map((_, i) => i));
    expect(analysis.map((t) => t.trialIndex)).toEqual(analysis.map((_, i) => i + 1));
  });

  it("never repeats a pair among main trials and only uses analysis clips", () => {
    expect(new Set(main.map(pairKey)).size).toBe(70);
    for (const t of main) {
      expect(t.left).not.toBe(t.right);
      expect(clips).toContain(t.left);
      expect(clips).toContain(t.right);
    }
  });

  it("balances clip appearances across main trials (max - min <= 1)", () => {
    const counts = new Map(clips.map((c) => [c, 0]));
    for (const t of main) for (const c of [t.left, t.right]) counts.set(c, counts.get(c)! + 1);
    const v = [...counts.values()];
    expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
  });

  it("puts each clip on the left about half the time in main trials", () => {
    for (const c of clips) {
      const total = main.filter((t) => t.left === c || t.right === c).length;
      const left = main.filter((t) => t.left === c).length;
      expect(Math.abs(left - total / 2), c).toBeLessThanOrEqual(1);
    }
  });

  it("never shows the same clip in two consecutive trials", () => {
    for (let i = 1; i < analysis.length; i++) {
      const a = analysis[i - 1]!;
      const b = analysis[i]!;
      const shared = [a.left, a.right].some((c) => c === b.left || c === b.right);
      expect(shared, `positions ${a.trialIndex}/${b.trialIndex}`).toBe(false);
    }
  });

  it("places repeats correctly: originals in 1-50, spacing >= 20, sides swapped, each original used once", () => {
    const bySeq = new Map(s.map((t) => [t.seq, t]));
    const originals = new Set<number>();
    for (const r of repeats) {
      const o = bySeq.get(r.repeatOfSeq!)!;
      expect(o.isRepeat || o.isAttentionCheck || o.isPractice).toBe(false);
      expect(o.trialIndex).toBeLessThanOrEqual(50);
      expect(r.trialIndex - o.trialIndex).toBeGreaterThanOrEqual(20);
      expect([r.left, r.right]).toEqual([o.right, o.left]);
      originals.add(o.seq);
    }
    expect(originals.size).toBe(10);
  });

  it("spreads repeats across the session: half in the first half (trials 1-41), half in the second", () => {
    const firstHalf = repeats.filter((r) => r.trialIndex <= 41).length;
    expect(firstHalf).toBe(design.repeatsInFirstHalf);
    expect(firstHalf).toBe(5);
    expect(repeats.length - firstHalf).toBe(5);
  });

  it("places attention checks in trials 25-75, >= 20 apart, not next to a break, with identical clips", () => {
    expect(design).toMatchObject({ attentionCheckMinPosition: 25, attentionCheckMaxPosition: 75, attentionCheckMinSpacing: 20 });
    for (const a of attention) {
      expect(a.trialIndex).toBeGreaterThanOrEqual(25);
      expect(a.trialIndex).toBeLessThanOrEqual(75);
      // Not the last trial before a break (27, 54) or the first trial after one (28, 55).
      expect([27, 28, 54, 55]).not.toContain(a.trialIndex);
      expect(a.left).toBe(a.right);
    }
    expect(Math.abs(attention[0]!.trialIndex - attention[1]!.trialIndex)).toBeGreaterThanOrEqual(20);
  });

  it("balances scenes across analysis trials (max - min <= 1) and never runs one scene more than 2 in a row", () => {
    const counts = new Map(CLIP_SCENES.map((c) => [c as string, 0]));
    for (const t of analysis) counts.set(t.scene, counts.get(t.scene)! + 1);
    expect(counts.size).toBe(CLIP_SCENES.length);
    const v = [...counts.values()];
    expect(Math.max(...v) - Math.min(...v)).toBeLessThanOrEqual(1);
    for (let i = 2; i < analysis.length; i++) {
      const run = new Set([analysis[i - 2]!.scene, analysis[i - 1]!.scene, analysis[i]!.scene]);
      expect(run.size, `trials ${i - 1}-${i + 1}`).toBeGreaterThan(1);
    }
  });

  it("keeps the original scene for repeats and uses one valid scene for practice", () => {
    const bySeq = new Map(s.map((t) => [t.seq, t]));
    for (const r of repeats) expect(r.scene).toBe(bySeq.get(r.repeatOfSeq!)!.scene);
    const practice = s.filter((t) => t.isPractice);
    expect(new Set(practice.map((t) => t.scene)).size).toBe(1);
    expect(CLIP_SCENES).toContain(practice[0]!.scene);
  });

  it("uses two distinct practice pairs from the practice clips", () => {
    const practice = s.filter((t) => t.isPractice);
    const used = practice.flatMap((t) => [t.left, t.right]);
    expect(new Set(used).size).toBe(4);
    for (const c of used) expect(practiceClips).toContain(c);
  });
});

describe("break positions", () => {
  it("are after analysis trials 27 and 54", () => {
    expect(design.breakAfter).toEqual([27, 54]);
  });
});

describe("schedule reproducibility", () => {
  it("gives identical output for the same seed and different output for another seed", () => {
    expect(make(31337)).toEqual(make(31337));
    expect(make(31337)).not.toEqual(make(31338));
  });
});
