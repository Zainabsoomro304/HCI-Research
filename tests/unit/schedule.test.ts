import { describe, expect, it } from "vitest";
import rawClips from "@data/clips.json";
import { COMPARISON_DESIGN, totalAnalysisTrials } from "@/config/study";
import { parseClipsFile } from "@/lib/clipsFile";
import { generateSchedule, type ScheduledTrial } from "@/lib/schedule";

const clipsFile = parseClipsFile(rawClips);
const clips = clipsFile.clips.map((c) => c.id);
const practiceClips = clipsFile.practiceClips.map((c) => c.id);
const design = COMPARISON_DESIGN[1];
const make = (seed: number) => generateSchedule({ clips, practiceClips, design, seed });

const SEEDS = [1, 2, 3, 42, 1234, 99991, 2026, 777777];
const pairKey = (t: ScheduledTrial) => [t.left, t.right].sort().join("|");

describe.each(SEEDS)("trial schedule (seed %i)", (seed) => {
  const s = make(seed);
  const analysis = s.filter((t) => !t.isPractice);
  const main = analysis.filter((t) => !t.isRepeat && !t.isAttentionCheck);
  const repeats = analysis.filter((t) => t.isRepeat);
  const attention = analysis.filter((t) => t.isAttentionCheck);

  it("has the right counts (2 practice + 100 main + 15 repeats + 2 attention = 119)", () => {
    expect(s).toHaveLength(design.practiceTrials + totalAnalysisTrials(design));
    expect(s.filter((t) => t.isPractice)).toHaveLength(2);
    expect(main).toHaveLength(100);
    expect(repeats).toHaveLength(15);
    expect(attention).toHaveLength(2);
    expect(s.map((t) => t.seq)).toEqual(s.map((_, i) => i));
    expect(analysis.map((t) => t.trialIndex)).toEqual(analysis.map((_, i) => i + 1));
  });

  it("never repeats a pair among main trials and only uses analysis clips", () => {
    expect(new Set(main.map(pairKey)).size).toBe(100);
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

  it("places repeats correctly: originals in 1-60, repeats in 61+, spacing >= 25, sides swapped", () => {
    const bySeq = new Map(s.map((t) => [t.seq, t]));
    const originals = new Set<number>();
    for (const r of repeats) {
      const o = bySeq.get(r.repeatOfSeq!)!;
      expect(o.isRepeat || o.isAttentionCheck || o.isPractice).toBe(false);
      expect(o.trialIndex).toBeLessThanOrEqual(design.repeatSourceMaxPosition);
      expect(r.trialIndex).toBeGreaterThanOrEqual(design.repeatInsertMinPosition);
      expect(r.trialIndex - o.trialIndex).toBeGreaterThanOrEqual(design.repeatMinSpacing);
      expect([r.left, r.right]).toEqual([o.right, o.left]);
      originals.add(o.seq);
    }
    expect(originals.size).toBe(15);
  });

  it("places attention checks in positions 30-100 with identical clips", () => {
    for (const a of attention) {
      expect(a.trialIndex).toBeGreaterThanOrEqual(30);
      expect(a.trialIndex).toBeLessThanOrEqual(100);
      expect(a.left).toBe(a.right);
    }
  });

  it("uses two distinct practice pairs from the practice clips", () => {
    const practice = s.filter((t) => t.isPractice);
    const used = practice.flatMap((t) => [t.left, t.right]);
    expect(new Set(used).size).toBe(4);
    for (const c of used) expect(practiceClips).toContain(c);
  });
});

describe("schedule reproducibility", () => {
  it("gives identical output for the same seed and different output for another seed", () => {
    expect(make(31337)).toEqual(make(31337));
    expect(make(31337)).not.toEqual(make(31338));
  });
});
