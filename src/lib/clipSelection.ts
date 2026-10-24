/**
 * Balanced selection of clip target configurations.
 *
 * Objective (lexicographic via weights):
 *  1. every level of every setting appears as evenly as possible (max - min <= 1),
 *  2. the number of settings changed from the base config is balanced across the allowed values
 *     (transition "busyness" must not be confounded with any level),
 *  3. equal mean busyness across the non-base levels of each setting (e.g. grid2 vs grid3), so busyness is
 *     not confounded with a particular target level (base levels are one change lower by construction),
 *  4. secondary: two-way balance between settings (level combinations spread evenly).
 */
import {
  DEFAULT_CONFIG,
  SETTING_KEYS,
  SETTING_LEVELS,
  allConfigs,
  numChangedSettings,
  toConfigId,
  type SettingKey,
  type UIConfig,
} from "@/config/uiSpace";
import { createRng } from "./random";

export interface SelectionOptions {
  size: number;
  /** Allowed numbers of changed settings (e.g. [2, 3, 4]). */
  allowedChanges: readonly number[];
  seed: number;
  base?: UIConfig;
  restarts?: number;
  iterations?: number;
  /** Configs that may not be selected (in addition to the base). */
  exclude?: readonly string[];
}

export interface SelectionResult {
  configs: UIConfig[];
  cost: number;
  levelCounts: Record<SettingKey, Record<string, number>>;
  changeCounts: Record<number, number>;
}

const W_LEVEL = 100;
const W_CHANGES = 100;
const W_BUSY = 20;
const W_PAIR = 1;

export function levelCounts(configs: readonly UIConfig[]): Record<SettingKey, Record<string, number>> {
  const out = {} as Record<SettingKey, Record<string, number>>;
  for (const k of SETTING_KEYS) {
    out[k] = Object.fromEntries(SETTING_LEVELS[k].map((l) => [l, 0]));
    for (const c of configs) out[k][c[k]]!++;
  }
  return out;
}

export function changeCounts(configs: readonly UIConfig[], allowed: readonly number[], base: UIConfig = DEFAULT_CONFIG): Record<number, number> {
  const out: Record<number, number> = Object.fromEntries(allowed.map((n) => [n, 0]));
  for (const c of configs) {
    const n = numChangedSettings(c, base);
    out[n] = (out[n] ?? 0) + 1;
  }
  return out;
}

/** Numeric encoding for a fast cost function: level index per setting + number of changes. */
interface Encoded {
  levels: number[];
  changes: number;
}

function encode(c: UIConfig, base: UIConfig): Encoded {
  return { levels: SETTING_KEYS.map((k) => (SETTING_LEVELS[k] as readonly string[]).indexOf(c[k])), changes: numChangedSettings(c, base) };
}

const NUM_LEVELS = SETTING_KEYS.map((k) => SETTING_LEVELS[k].length);

function cost(sel: readonly Encoded[], allowed: readonly number[], baseLevels: number[]): number {
  const n = sel.length;
  let total = 0;
  for (let s = 0; s < NUM_LEVELS.length; s++) {
    const L = NUM_LEVELS[s]!;
    if (L < 3) continue; // two-level settings have a single non-base level
    const cnt = new Array<number>(L).fill(0);
    const sum = new Array<number>(L).fill(0);
    for (const e of sel) {
      cnt[e.levels[s]!]!++;
      sum[e.levels[s]!]! += e.changes;
    }
    let nb = 0;
    let nbSum = 0;
    for (let l = 0; l < L; l++) if (l !== baseLevels[s]) (nb += cnt[l]!), (nbSum += sum[l]!);
    const mean = nb ? nbSum / nb : 0;
    for (let l = 0; l < L; l++) if (l !== baseLevels[s]) total += W_BUSY * (sum[l]! - cnt[l]! * mean) ** 2;
  }
  for (let s = 0; s < NUM_LEVELS.length; s++) {
    const L = NUM_LEVELS[s]!;
    const counts = new Array<number>(L).fill(0);
    for (const e of sel) counts[e.levels[s]!]!++;
    for (const v of counts) total += W_LEVEL * (v - n / L) ** 2;
  }
  const cc = new Map<number, number>();
  for (const e of sel) cc.set(e.changes, (cc.get(e.changes) ?? 0) + 1);
  for (const a of allowed) total += W_CHANGES * ((cc.get(a) ?? 0) - n / allowed.length) ** 2;
  for (let i = 0; i < NUM_LEVELS.length; i++)
    for (let j = i + 1; j < NUM_LEVELS.length; j++) {
      const Li = NUM_LEVELS[i]!;
      const Lj = NUM_LEVELS[j]!;
      const counts = new Array<number>(Li * Lj).fill(0);
      for (const e of sel) counts[e.levels[i]! * Lj + e.levels[j]!]!++;
      const target = n / (Li * Lj);
      for (const v of counts) total += W_PAIR * (v - target) ** 2;
    }
  return total;
}

export function selectBalancedClips(opts: SelectionOptions): SelectionResult {
  const base = opts.base ?? DEFAULT_CONFIG;
  const exclude = new Set([toConfigId(base), ...(opts.exclude ?? [])]);
  const configs = allConfigs().filter((c) => !exclude.has(toConfigId(c)) && opts.allowedChanges.includes(numChangedSettings(c, base)));
  const candidates = configs.map((_, i) => i);
  const enc = configs.map((c) => encode(c, base));
  const baseLevels = encode(base, base).levels;
  if (candidates.length < opts.size) throw new Error(`Only ${candidates.length} candidates for ${opts.size} clips`);
  const rng = createRng(opts.seed);
  const restarts = opts.restarts ?? 40;
  const iterations = opts.iterations ?? 6000;

  let best: number[] = [];
  let bestCost = Infinity;
  for (let r = 0; r < restarts; r++) {
    const order = rng.shuffle(candidates);
    let sel = order.slice(0, opts.size);
    let rest = order.slice(opts.size);
    const costOf = (idx: number[]) => cost(idx.map((k) => enc[k]!), opts.allowedChanges, baseLevels);
    let cur = costOf(sel);
    // Simulated annealing over swap moves.
    for (let it = 0; it < iterations; it++) {
      const temp = 50 * (1 - it / iterations) + 0.01;
      const i = rng.int(0, sel.length - 1);
      const j = rng.int(0, rest.length - 1);
      const nextSel = sel.slice();
      const nextRest = rest.slice();
      [nextSel[i], nextRest[j]] = [rest[j]!, sel[i]!];
      const c = costOf(nextSel);
      if (c <= cur || rng.next() < Math.exp((cur - c) / temp)) {
        sel = nextSel;
        rest = nextRest;
        cur = c;
      }
    }
    if (cur < bestCost) {
      bestCost = cur;
      best = sel;
    }
  }
  // Stable output order: by number of changes, then config ID.
  const chosen = best.map((k) => configs[k]!);
  chosen.sort((a, b) => numChangedSettings(a, base) - numChangedSettings(b, base) || toConfigId(a).localeCompare(toConfigId(b)));
  return { configs: chosen, cost: bestCost, levelCounts: levelCounts(chosen), changeCounts: changeCounts(chosen, opts.allowedChanges, base) };
}

/** max - min of a count table. */
export function spread(counts: Record<string, number>): number {
  const v = Object.values(counts);
  return Math.max(...v) - Math.min(...v);
}
