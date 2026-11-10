/**
 * Comparison trial schedule generator (pure, seeded, fully reproducible).
 *
 * Analysis phase (positions 1..N, N = main + repeats + attention checks):
 *  - main trials: unique pairs of analysis clips; each clip appears equally often (max - min <= 1);
 *    each clip is on the left within +/-1 of half its main appearances (Euler-circuit orientation);
 *  - repeats: copies of main trials from positions <= repeatSourceMaxPosition, placed >= repeatMinSpacing
 *    positions after their original, with sides swapped; repeatsInFirstHalf of them fall in the first half of the
 *    session (positions <= floor(N/2)) and the rest in the second half, so consistency is sampled throughout;
 *  - attention checks: the same clip on both sides, at positions in [min, max], at least attentionCheckMinSpacing
 *    apart, never on the last trial before a break or the first trial after one;
 *  - no clip appears in two consecutive trials anywhere in the sequence.
 * Practice trials (each a distinct pair of practice clips) come first and are numbered separately.
 *
 * Scenes (product categories shown in the clips): both clips of a trial always share one scene. Across the analysis
 * trials every scene appears equally often (max - min <= 1), no scene appears in more than 2 consecutive trials, and
 * a repeat keeps the scene of its original trial. Practice trials use one scene, not counted in the balance.
 */
import type { ComparisonDesign } from "@/config/study";
import { createRng, type Rng } from "./random";

export interface ScheduledTrial {
  /** 0-based presentation order including practice. */
  seq: number;
  /** 1-based number shown to the participant (practice and analysis numbered separately). */
  trialIndex: number;
  isPractice: boolean;
  isRepeat: boolean;
  /** seq of the original trial (repeats only). */
  repeatOfSeq: number | null;
  isAttentionCheck: boolean;
  left: string;
  right: string;
  /** Product category shown in both clips. */
  scene: string;
}

type Pair = [string, string];

/** Random simple graph with the given degree sequence (randomised Havel-Hakimi + degree-preserving swaps). */
function randomPairs(clips: readonly string[], numPairs: number, rng: Rng): Pair[] {
  const n = clips.length;
  const total = numPairs * 2;
  const base = Math.floor(total / n);
  const extra = total - base * n;
  if (numPairs > (n * (n - 1)) / 2) throw new Error("More main trials than unique pairs");
  const order = rng.shuffle(clips.map((_, i) => i));
  const degree = new Array<number>(n).fill(base);
  for (let i = 0; i < extra; i++) degree[order[i]!]!++;

  const edges = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const remaining = degree.slice();
  for (let guard = 0; guard < n * n; guard++) {
    const alive = remaining.map((d, i) => [d, i, rng.next()] as const).filter(([d]) => d > 0);
    if (alive.length === 0) break;
    alive.sort((a, b) => b[0] - a[0] || a[2] - b[2]);
    const [d, v] = alive[0]!;
    const targets = alive.slice(1).filter(([, u]) => !edges.has(key(u, v)));
    if (targets.length < d) throw new Error("Degree sequence not realisable");
    for (const [, u] of targets.slice(0, d)) {
      edges.add(key(u, v));
      remaining[u]!--;
    }
    remaining[v] = 0;
  }
  let list = [...edges].map((e) => e.split("-").map(Number) as [number, number]);
  if (list.length !== numPairs) throw new Error(`Built ${list.length} pairs instead of ${numPairs}`);
  // Degree-preserving double-edge swaps to randomise.
  for (let s = 0; s < numPairs * 20; s++) {
    const i = rng.int(0, list.length - 1);
    const j = rng.int(0, list.length - 1);
    if (i === j) continue;
    const [a, b] = list[i]!;
    const [c, d] = list[j]!;
    const [x1, y1, x2, y2] = rng.next() < 0.5 ? [a, c, b, d] : [a, d, b, c];
    if (x1 === y1 || x2 === y2 || edges.has(key(x1, y1)) || edges.has(key(x2, y2))) continue;
    edges.delete(key(a, b));
    edges.delete(key(c, d));
    edges.add(key(x1, y1));
    edges.add(key(x2, y2));
    list[i] = [x1, y1];
    list[j] = [x2, y2];
  }
  list = list.map(([a, b]) => [a, b]);
  return list.map(([a, b]) => [clips[a]!, clips[b]!]);
}

/** Orient each pair (left, right) so every clip's left count is within +/-1 of half its appearances. */
function balanceSides(pairs: Pair[], rng: Rng): Pair[] {
  // Euler-circuit trick: connect odd-degree vertices to a dummy vertex, walk an Euler circuit, orient along it.
  const DUMMY = "__dummy__";
  const adj = new Map<string, { to: string; id: number }[]>();
  const add = (a: string, b: string, id: number) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push({ to: b, id });
    adj.get(b)!.push({ to: a, id });
  };
  pairs.forEach(([a, b], i) => add(a, b, i));
  let nextId = pairs.length;
  for (const [v, list] of [...adj.entries()]) if (list.length % 2 === 1) add(v, DUMMY, nextId++);
  for (const list of adj.values()) {
    const shuffled = rng.shuffle(list);
    list.splice(0, list.length, ...shuffled);
  }
  const used = new Set<number>();
  const oriented = new Map<number, Pair>();
  for (const start of rng.shuffle([...adj.keys()])) {
    // Hierholzer: walk unused edges, orient in walking direction.
    const stack = [start];
    while (stack.length) {
      const v = stack[stack.length - 1]!;
      const list = adj.get(v)!;
      while (list.length && used.has(list[list.length - 1]!.id)) list.pop();
      const e = list.pop();
      if (!e) {
        stack.pop();
        continue;
      }
      used.add(e.id);
      if (e.id < pairs.length) oriented.set(e.id, [v, e.to]);
      stack.push(e.to);
    }
  }
  return pairs.map((_, i) => oriented.get(i)!);
}

function shares(a: { left: string; right: string } | undefined, b: { left: string; right: string }): boolean {
  if (!a) return false;
  return a.left === b.left || a.left === b.right || a.right === b.left || a.right === b.right;
}

/** Max run of one scene in consecutive analysis trials. */
export const MAX_SCENE_RUN = 2;

/**
 * Scene per analysis position (1..N). Originals of repeats count twice, because their repeat inherits the scene, so
 * the final counts come out balanced. Returns null if this draw could not satisfy the rules (the caller retries).
 */
function assignScenes(N: number, repeatOf: Map<number, number>, scenes: readonly string[], rng: Rng): string[] | null {
  const repeated = new Set(repeatOf.values());
  const out: string[] = new Array(N + 1);
  const count = new Map(scenes.map((s) => [s, 0]));
  const quota = Math.ceil(N / scenes.length);
  for (let p = 1; p <= N; p++) {
    const runOk = (s: string) => !(p > MAX_SCENE_RUN && Array.from({ length: MAX_SCENE_RUN }, (_, k) => out[p - 1 - k]).every((x) => x === s));
    const origin = repeatOf.get(p);
    if (origin !== undefined) {
      out[p] = out[origin]!;
      if (!runOk(out[p]!)) return null;
      continue;
    }
    const weight = repeated.has(p) ? 2 : 1;
    const allowed = rng.shuffle(scenes).filter((s) => runOk(s) && count.get(s)! + weight <= quota);
    if (allowed.length === 0) return null;
    const least = Math.min(...allowed.map((s) => count.get(s)!));
    const pick = allowed.find((s) => count.get(s) === least)!;
    out[p] = pick;
    count.set(pick, count.get(pick)! + weight);
  }
  const counts = [...count.values()];
  return Math.max(...counts) - Math.min(...counts) <= 1 ? out : null;
}

export function generateSchedule(opts: {
  clips: readonly string[];
  practiceClips: readonly string[];
  design: ComparisonDesign;
  seed: number;
  /** Scenes to balance across the analysis trials. */
  scenes: readonly string[];
}): ScheduledTrial[] {
  const { clips, practiceClips, design, seed, scenes } = opts;
  if (scenes.length === 0) throw new Error("At least one scene is needed");
  const rng = createRng(seed);
  if (practiceClips.length < design.practiceTrials * 2) throw new Error("Not enough practice clips");
  const N = design.mainTrials + design.repeatTrials + design.attentionChecks;

  for (let attempt = 0; attempt < 500; attempt++) {
    const mainPairs = balanceSides(randomPairs(clips, design.mainTrials, rng), rng);

    // Slot types for positions 1..N.
    const slot: ("main" | "repeat" | "attention")[] = new Array(N + 1).fill("main");
    const nearBreak = new Set(design.breakAfter.flatMap((b) => [b, b + 1]));
    const attnCandidates: number[] = [];
    for (let p = design.attentionCheckMinPosition; p <= Math.min(design.attentionCheckMaxPosition, N); p++) if (!nearBreak.has(p)) attnCandidates.push(p);
    const attnPos: number[] = [];
    for (const p of rng.shuffle(attnCandidates)) {
      if (attnPos.length === design.attentionChecks) break;
      if (attnPos.every((q) => Math.abs(p - q) >= design.attentionCheckMinSpacing)) attnPos.push(p);
    }
    if (attnPos.length < design.attentionChecks) continue; // spacing not satisfiable with this draw: retry
    attnPos.forEach((p) => (slot[p] = "attention"));
    // Repeats: a fixed number in each half. The earliest possible repeat position is 1 + repeatMinSpacing.
    const half = Math.floor(N / 2);
    const positions = (from: number, to: number) => {
      const out: number[] = [];
      for (let p = from; p <= to; p++) if (slot[p] === "main") out.push(p);
      return out;
    };
    const firstCount = Math.min(design.repeatsInFirstHalf, design.repeatTrials);
    const repPos = [
      ...rng.shuffle(positions(1 + design.repeatMinSpacing, half)).slice(0, firstCount),
      ...rng.shuffle(positions(half + 1, N)).slice(0, design.repeatTrials - firstCount),
    ];
    if (repPos.length < design.repeatTrials) throw new Error("Not enough positions for repeats");
    repPos.forEach((p) => (slot[p] = "repeat"));

    // Fill slots sequentially, avoiding a clip in two consecutive trials.
    type Built = { left: string; right: string; kind: "main" | "repeat" | "attention"; repeatOfPos: number | null };
    const seqOut: (Built | undefined)[] = new Array(N + 1);
    let pool = rng.shuffle(mainPairs.map(([left, right]) => ({ left, right })));
    const usedOriginals = new Set<number>();
    let ok = true;
    for (let p = 1; p <= N && ok; p++) {
      const prev = seqOut[p - 1];
      if (slot[p] === "main") {
        const i = pool.findIndex((t) => !shares(prev, t));
        if (i < 0) ok = false;
        else {
          seqOut[p] = { ...pool[i]!, kind: "main", repeatOfPos: null };
          pool = pool.filter((_, k) => k !== i);
        }
      } else if (slot[p] === "repeat") {
        const eligible = [];
        for (let q = 1; q <= Math.min(design.repeatSourceMaxPosition, p - design.repeatMinSpacing); q++) {
          const t = seqOut[q];
          if (t?.kind === "main" && !usedOriginals.has(q) && !shares(prev, t)) eligible.push(q);
        }
        if (eligible.length === 0) ok = false;
        else {
          const q = rng.pick(eligible);
          usedOriginals.add(q);
          const orig = seqOut[q]!;
          seqOut[p] = { left: orig.right, right: orig.left, kind: "repeat", repeatOfPos: q };
        }
      } else {
        const options = clips.filter((c) => !prev || (c !== prev.left && c !== prev.right));
        const c = rng.pick(options);
        seqOut[p] = { left: c, right: c, kind: "attention", repeatOfPos: null };
      }
    }
    if (!ok) continue;

    const repeatOf = new Map<number, number>();
    for (let p = 1; p <= N; p++) if (seqOut[p]!.repeatOfPos !== null) repeatOf.set(p, seqOut[p]!.repeatOfPos!);
    let sceneOf: string[] | null = null;
    for (let tries = 0; tries < 200 && !sceneOf; tries++) sceneOf = assignScenes(N, repeatOf, scenes, rng);
    if (!sceneOf) continue;
    const practiceScene = rng.pick(scenes);

    const P = design.practiceTrials;
    const practice = rng.shuffle(practiceClips).slice(0, P * 2);
    const out: ScheduledTrial[] = [];
    for (let i = 0; i < P; i++) {
      const [a, b] = rng.next() < 0.5 ? [practice[2 * i]!, practice[2 * i + 1]!] : [practice[2 * i + 1]!, practice[2 * i]!];
      out.push({ seq: i, trialIndex: i + 1, isPractice: true, isRepeat: false, repeatOfSeq: null, isAttentionCheck: false, left: a, right: b, scene: practiceScene });
    }
    for (let p = 1; p <= N; p++) {
      const t = seqOut[p]!;
      out.push({
        seq: P + p - 1,
        trialIndex: p,
        isPractice: false,
        isRepeat: t.kind === "repeat",
        repeatOfSeq: t.repeatOfPos === null ? null : P + t.repeatOfPos - 1,
        isAttentionCheck: t.kind === "attention",
        left: t.left,
        right: t.right,
        scene: sceneOf[p]!,
      });
    }
    return out;
  }
  throw new Error(`Could not build a schedule for seed ${seed}`);
}
