/**
 * Seeded pseudo-random numbers. Every random draw in the study goes through an Rng created from a
 * stored seed, so schedules and selections are exactly reproducible.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  /** Returns a shuffled copy (Fisher-Yates). */
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
}

/** mulberry32: small, fast, good enough statistical quality for experimental design. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    shuffle<T>(items: readonly T[]) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    pick<T>(items: readonly T[]) {
      if (items.length === 0) throw new Error("pick from empty array");
      return items[int(0, items.length - 1)]!;
    },
  };
}

/** A new random seed (positive 31-bit integer) for a participant. */
export function newSeed(): number {
  return 1 + Math.floor(Math.random() * 0x7ffffffe);
}
