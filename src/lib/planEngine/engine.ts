/**
 * Plan engine: leave-one-out shared models, the four condition models and their targets, from Session A comparisons.
 * Pure and deterministic: no database and no clock. Ported from analysis/src/hci (loo.py, conditions.py).
 */
import { PLAN_ENGINE } from "@/config/planEngine";
import { CONDITIONS, type Condition } from "@/config/study";
import { createRng } from "../random";
import { restrictedArgmax, solveMdp, topGap, unrestrictedArgmax } from "./agent";
import { kmeans, silhouette } from "./kmeans";
import { BASE_CONFIG_ID, N_FEATURES, comparisons, estimateNuisance, first, fitMap, fitPooled, logLikelihood, take, type Comparisons, type Nuisance } from "./model";

export interface EngineTrial {
  left: string;
  right: string;
  choice: string;
}
export interface EngineParticipant {
  code: string;
  /** Answered main trials in chronological order. */
  trials: EngineTrial[];
}

export interface SharedModels {
  nuisance: Nuisance;
  sigma: number;
  globalW: number[];
  clusterWeights: number[][];
  /** Cluster of each training participant, in sorted code order. */
  clusterLabels: number[];
  clusterCodes: string[];
  silhouette: number | null;
}

export interface ParticipantModels {
  code: string;
  /** "loo": built without this person. "pool": they were never in the training data (attention failure or late). */
  basis: "loo" | "pool";
  sigma: number;
  nuisance: Nuisance;
  clusterCount: number;
  assignedCluster: number;
  globalW: number[];
  clusterW: number[];
  cluster5W: number[];
  personalW: number[];
  targets: Record<Condition, string>;
  /** The target the 108-config search would pick if not limited to 2-4 changes. */
  unrestrictedPersonalTarget: string;
  agent: { matches: boolean; mismatches: string[]; pathLengths: Record<string, number> };
  flags: {
    identicalTargets: string[];
    agentMismatch: boolean;
    nearTie: string[];
    equalsGlobal: string[];
  };
}

export interface EngineResult {
  pool: SharedModels;
  participants: ParticipantModels[];
  warnings: string[];
}

/** FNV-1a: turns a text key into a seed, the same way in Python and TypeScript. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function sortedCodes<T>(people: ReadonlyMap<string, T>): string[] {
  return [...people.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Returns (test indices, chronological training pool). */
export function makeSplit(nMain: number, nTest: number, seed: number): { test: number[]; pool: number[] } {
  const order = createRng(seed).shuffle(Array.from({ length: nMain }, (_, i) => i));
  const test = order.slice(0, nTest).sort((a, b) => a - b);
  const held = new Set(test);
  return { test, pool: Array.from({ length: nMain }, (_, i) => i).filter((i) => !held.has(i)) };
}

function chooseClusters(points: number[][], useClusters: boolean, seed: number): { labels: number[]; k: number; silhouette: number | null } {
  const fallback = { labels: points.map(() => 0), k: 1, silhouette: null };
  if (!useClusters) return fallback;
  let best: { labels: number[]; k: number; silhouette: number } | null = null;
  for (const k of [...PLAN_ENGINE.clusterCandidates].sort((a, b) => a - b)) {
    if (k >= points.length) continue;
    const { labels } = kmeans(points, k, seed, PLAN_ENGINE.kmeansInits);
    const s = silhouette(points, labels);
    if (!best || s > best.silhouette) best = { labels, k, silhouette: s };
  }
  return best ?? fallback;
}

/**
 * Everything a held-out person starts from, built only from the people passed in. A pooled fit depends only on who is
 * in the group, so sigma selection passes a cache (for one fixed nuisance) to reuse it across the sigma grid.
 */
export function buildShared(others: ReadonlyMap<string, Comparisons>, sigma: number, nuisance: Nuisance, useClusters: boolean, seed: number, cache?: Map<string, number[]>): SharedModels {
  const codes = sortedCodes(others);
  const parts = codes.map((c) => others.get(c)!);
  const pooled = (members: readonly string[], data: readonly Comparisons[]) => {
    const key = members.join("|");
    const known = cache?.get(key);
    if (known) return known;
    const w = fitPooled(data, PLAN_ENGINE.sigmaPool, nuisance);
    cache?.set(key, w);
    return w;
  };
  const globalW = pooled(codes, parts);
  const scratch = parts.map((p) => fitMap(p, { sigma, nuisance }));
  const chosen = chooseClusters(scratch, useClusters, seed);
  const clusterWeights =
    chosen.k === 1
      ? [globalW]
      : Array.from({ length: chosen.k }, (_, c) =>
          pooled(
            codes.filter((_, i) => chosen.labels[i] === c),
            parts.filter((_, i) => chosen.labels[i] === c),
          ),
        );
  return { nuisance, sigma, globalW, clusterWeights, clusterLabels: chosen.labels, clusterCodes: codes, silhouette: chosen.silhouette };
}

export function assignByLikelihood(data: Comparisons, clusterWeights: readonly number[][], nuisance: Nuisance): number {
  let best = 0;
  let bestValue = -Infinity;
  clusterWeights.forEach((w, c) => {
    const value = logLikelihood(data, w, nuisance);
    if (value > bestValue) {
      bestValue = value;
      best = c;
    }
  });
  return best;
}

/**
 * One sigma for all starting points: the lowest held-out log-loss, averaged over every starting point and k. It runs
 * entirely inside the people it is given: each fold is treated as new users, with models from the remaining folds.
 */
export function selectSigma(others: ReadonlyMap<string, Comparisons>, nuisance: Nuisance, useClusters: boolean): number {
  const codes = sortedCodes(others);
  if (codes.length < PLAN_ENGINE.minPeopleForSigmaCv) return PLAN_ENGINE.fallbackSigma;
  const seed = PLAN_ENGINE.seedFolds;
  const folds = PLAN_ENGINE.sigmaInnerFolds;
  const order = createRng(seed).shuffle(codes.map((_, i) => i));
  const foldOf = order.map((v) => v % folds);
  let bestSigma: number = PLAN_ENGINE.sigmaGrid[0]!;
  let bestLoss = Infinity;
  const cache = new Map<string, number[]>();
  for (const sigma of PLAN_ENGINE.sigmaGrid) {
    let total = 0;
    let count = 0;
    for (let fold = 0; fold < folds; fold++) {
      const rest = new Map(codes.filter((_, i) => foldOf[i] !== fold).map((c) => [c, others.get(c)!]));
      const shared = buildShared(rest, sigma, nuisance, useClusters, seed, cache);
      for (const code of codes.filter((_, i) => foldOf[i] === fold)) {
        const data = others.get(code)!;
        const { test, pool } = makeSplit(data.n, Math.min(PLAN_ENGINE.nTest, Math.floor(data.n / 2)), hashSeed(`${seed}|${code}|0`));
        const heldOut = take(data, test);
        const train = take(data, pool);
        const add = (w: readonly number[]) => {
          total -= logLikelihood(heldOut, w, nuisance);
          count += heldOut.n;
        };
        add(shared.globalW);
        for (const k of PLAN_ENGINE.kValues) {
          const seen = first(train, k);
          add(fitMap(seen, { sigma, nuisance }));
          add(fitMap(seen, { mu: shared.globalW, sigma, nuisance }));
          const assigned = assignByLikelihood(seen, shared.clusterWeights, nuisance);
          add(fitMap(seen, { mu: shared.clusterWeights[assigned]!, sigma, nuisance }));
        }
      }
    }
    const loss = count > 0 ? total / count : Infinity;
    if (loss < bestLoss) {
      bestLoss = loss;
      bestSigma = sigma;
    }
  }
  return bestSigma;
}

function sharedFrom(people: ReadonlyMap<string, Comparisons>, useClusters: boolean): SharedModels {
  const codes = sortedCodes(people);
  const nuisance = estimateNuisance(
    codes.map((c) => people.get(c)!),
    { sigma: PLAN_ENGINE.nuisanceSigma, rounds: PLAN_ENGINE.nuisanceRounds, useCurvature: PLAN_ENGINE.useCurvature },
  );
  const sigma = selectSigma(people, nuisance, useClusters);
  return buildShared(people, sigma, nuisance, useClusters, PLAN_ENGINE.seedClustering);
}

function modelsFor(code: string, own: Comparisons, shared: SharedModels, basis: "loo" | "pool"): ParticipantModels {
  const { sigma, nuisance } = shared;
  const { minChanged, maxChanged, agentHorizon, agentStepCost, nearTieGap, fineTuneK } = PLAN_ENGINE;
  const early = first(own, fineTuneK);
  const assigned = assignByLikelihood(early, shared.clusterWeights, nuisance);
  const clusterW = shared.clusterWeights[assigned]!;
  const cluster5W = fitMap(early, { mu: clusterW, sigma, nuisance });
  const personalW = fitMap(own, { sigma, nuisance });
  const weights: Record<Exclude<Condition, "static">, number[]> = { global: shared.globalW, cluster5: cluster5W, personalFull: personalW };

  const targets = { static: BASE_CONFIG_ID } as Record<Condition, string>;
  const mismatches: string[] = [];
  const pathLengths: Record<string, number> = {};
  const nearTie: string[] = [];
  for (const condition of ["global", "cluster5", "personalFull"] as const) {
    const w = weights[condition];
    const best = restrictedArgmax(w, minChanged, maxChanged);
    const agent = solveMdp(w, { minChanged, maxChanged, horizon: agentHorizon, stepCost: agentStepCost });
    pathLengths[condition] = agent.path.length;
    if (agent.finalConfig !== best) mismatches.push(condition);
    // On a mismatch the brute-force result is used and the participant is flagged.
    targets[condition] = best;
    if (topGap(w, minChanged, maxChanged) < nearTieGap) nearTie.push(condition);
  }
  const identical: string[] = [];
  const adaptive = ["global", "cluster5", "personalFull"] as const;
  adaptive.forEach((a, i) => {
    for (const b of adaptive.slice(i + 1)) if (targets[a] === targets[b]) identical.push(`${a}=${b}`);
  });
  return {
    code,
    basis,
    sigma,
    nuisance,
    clusterCount: shared.clusterWeights.length,
    assignedCluster: assigned,
    globalW: shared.globalW,
    clusterW,
    cluster5W,
    personalW,
    targets,
    unrestrictedPersonalTarget: unrestrictedArgmax(personalW),
    agent: { matches: mismatches.length === 0, mismatches, pathLengths },
    flags: {
      identicalTargets: identical,
      agentMismatch: mismatches.length > 0,
      nearTie,
      equalsGlobal: (["cluster5", "personalFull"] as const).filter((c) => targets[c] === targets.global),
    },
  };
}

/**
 * `included` are the participants in model building; each gets leave-one-out models. `outside` are people who get a plan
 * but are not in the training data (attention failures): their models come from the full pool, which never saw them.
 */
export function computePlans(included: readonly EngineParticipant[], outside: readonly EngineParticipant[] = []): EngineResult {
  const pool = computePool(included);
  const participants = sortedCodes(new Map(included.map((p) => [p.code, p]))).map((code) => computeLeaveOneOut(code, included));
  for (const p of outside) participants.push(planFromPool(p, pool));
  return { pool, participants, warnings: engineWarnings(included.length) };
}

export function engineWarnings(eligible: number): string[] {
  return eligible >= PLAN_ENGINE.minEligibleForClusters ? [] : [`Only ${eligible} eligible participants: using 1 cluster (cluster = global). Cluster results are meaningless at this size.`];
}

/** The models from everyone included, used for people outside the training data. */
export function computePool(included: readonly EngineParticipant[]): SharedModels {
  return sharedFrom(new Map(included.map((p) => [p.code, comparisons(p.trials)])), included.length >= PLAN_ENGINE.minEligibleForClusters);
}

/** One included participant's models, built from everyone else. The cluster rule depends on the full eligible count. */
export function computeLeaveOneOut(code: string, included: readonly EngineParticipant[]): ParticipantModels {
  const own = included.find((p) => p.code === code);
  if (!own) throw new Error(`${code} is not among the included participants`);
  const others = new Map(included.filter((p) => p.code !== code).map((p) => [p.code, comparisons(p.trials)]));
  return modelsFor(code, comparisons(own.trials), sharedFrom(others, included.length >= PLAN_ENGINE.minEligibleForClusters), "loo");
}

/** A plan for someone outside the frozen data, from the stored pool models. */
export function planFromPool(participant: EngineParticipant, pool: SharedModels): ParticipantModels {
  return modelsFor(participant.code, comparisons(participant.trials), pool, "pool");
}

export function planFile(models: Pick<ParticipantModels, "code" | "targets">) {
  const step = (config: string) => ({ steps: [{ trigger: { type: "afterMs" as const, value: PLAN_ENGINE.triggerAfterMs }, config }] });
  return {
    participantCode: models.code,
    conditions: Object.fromEntries(CONDITIONS.map((c) => [c, c === "static" ? { steps: [] } : step(models.targets[c])])) as Record<Condition, { steps: { trigger: { type: "afterMs"; value: number }; config: string }[] }>,
  };
}

export { N_FEATURES };
