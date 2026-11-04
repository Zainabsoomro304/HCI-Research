import { describe, expect, it } from "vitest";
import { PLAN_ENGINE } from "@/config/planEngine";
import { ALL_CONFIG_IDS as PLATFORM_IDS, DEFAULT_CONFIG_ID, SETTING_LEVELS, SETTING_KEYS } from "@/config/uiSpace";
import { N_ACTIONS, restrictedArgmax, solveMdp, topGap, unrestrictedArgmax } from "@/lib/planEngine/agent";
import { assignByLikelihood, buildShared, computePlans, hashSeed, makeSplit, planFile, planFromPool, selectSigma, type EngineParticipant } from "@/lib/planEngine/engine";
import { kmeans, silhouette } from "@/lib/planEngine/kmeans";
import { ALL_CONFIG_IDS, BASE_CONFIG_ID, FEATURES, NO_NUISANCE, comparisons, encode, estimateNuisance, first, fitMap, logLikelihood, numChanged, score } from "@/lib/planEngine/model";
import { validatePlanFile } from "@/lib/plans";
import { createRng } from "@/lib/random";
import rawClips from "@data/clips.json";

const clips = rawClips.clips.map((c) => c.id);
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function simulate(code: string, seed: number, w: number[], n = 70): EngineParticipant {
  const r = createRng(seed);
  const trials = [];
  while (trials.length < n) {
    const [a, b] = [r.pick(clips), r.pick(clips)];
    if (a === b) continue;
    const d = score(w, a) - score(w, b);
    trials.push({ left: a, right: b, choice: r.next() < sigmoid(d) ? "left" : "right" });
  }
  return { code, trials };
}

const PROFILES = [
  [3, 4, -2, 0, 2, 3, 4, 1],
  [-3, -4, -3, 3, -2, -4, -3, -2],
  [2, 0, 2, -3, 3, 1, -2, 3],
];

function cohort(n: number): EngineParticipant[] {
  const r = createRng(99);
  return Array.from({ length: n }, (_, i) => {
    const w = PROFILES[i % 3]!.map((v) => v + (r.next() - 0.5));
    return simulate(`P3-${String(i + 1).padStart(3, "0")}`, 1000 + i, w);
  });
}

describe("encoding", () => {
  it("covers all 108 configs of the platform with the base as the zero vector", () => {
    expect(ALL_CONFIG_IDS).toHaveLength(108);
    expect(new Set(ALL_CONFIG_IDS)).toEqual(new Set(PLATFORM_IDS));
    expect(BASE_CONFIG_ID).toBe(DEFAULT_CONFIG_ID);
    expect(encode(BASE_CONFIG_ID)).toEqual(new Array(8).fill(0));
    expect(FEATURES).toEqual(["grid2", "grid3", "small", "large", "partial", "summary", "dark", "dropdown"]);
    for (const k of SETTING_KEYS) expect(new Set(SETTING_LEVELS[k]).size).toBeGreaterThan(1);
  });

  it("encodes each config as one level per setting, and counts changes as the sum of the dummies", () => {
    expect(encode("grid3-large-summary-dark-dropdown")).toEqual([0, 1, 0, 1, 0, 1, 1, 1]);
    expect(numChanged("grid3-large-summary-dark-dropdown")).toBe(5);
    expect(numChanged("list-default-partial-dark-sidebar")).toBe(2);
    expect(new Set(ALL_CONFIG_IDS.map((c) => encode(c).join())).size).toBe(108);
    expect(() => encode("table-default-detailed-light-sidebar")).toThrow();
  });
});

describe("MAP fitting", () => {
  // Known values, computed by hand for two comparisons on the single feature "dark" with a unit prior:
  // the gradient w + 2 * (sigmoid(w) - 1) = 0 has the root w = 0.67483
  it("matches a value worked out independently", () => {
    const data = comparisons([
      { left: "list-default-detailed-dark-sidebar", right: BASE_CONFIG_ID, choice: "left" },
      { left: "list-default-detailed-dark-sidebar", right: BASE_CONFIG_ID, choice: "left" },
    ]);
    const w = fitMap(data, { sigma: 1 });
    expect(w[6]).toBeCloseTo(0.67483, 4);
    expect(w[0]).toBeCloseTo(0, 10);
    expect(w[6]! + 2 * (sigmoid(w[6]!) - 1)).toBeCloseTo(0, 7);
  });

  it("returns the prior mean with no comparisons, for every starting point", () => {
    const empty = comparisons([]);
    const mu = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(fitMap(empty, { sigma: 1 })).toEqual(new Array(8).fill(0));
    expect(fitMap(empty, { sigma: 1, mu })).toEqual(mu);
  });

  it("recovers weights from enough comparisons, and a tight prior holds its mean", () => {
    const truth = PROFILES[0]!;
    const data = comparisons(simulate("x", 5, truth, 2000).trials);
    const w = fitMap(data, { sigma: 100 });
    for (let j = 0; j < 8; j++) expect(Math.abs(w[j]! - truth[j]!)).toBeLessThan(0.6);
    const mu = [1, 1, 1, 1, 1, 1, 1, 1];
    fitMap(data, { sigma: 0.001, mu }).forEach((v) => expect(v).toBeCloseTo(1, 1));
  });

  it("fits nuisance terms that are independent of the weights", () => {
    const people = [0, 1, 2, 3].map((i) => comparisons(simulate(`p${i}`, i, PROFILES[i % 3]!).trials));
    const without = estimateNuisance(people, { sigma: 2, rounds: 2, useCurvature: false });
    expect(without.kappa).toBe(0);
    expect(Number.isFinite(without.betaSide)).toBe(true);
    expect(estimateNuisance([], { sigma: 2, rounds: 2, useCurvature: true })).toEqual(NO_NUISANCE);
  });
});

describe("k-means", () => {
  const points = [
    [0, 0],
    [0.1, 0],
    [5, 5],
    [5.1, 5],
    [0, 0.1],
    [5, 5.1],
  ];

  it("finds clear clusters, numbered by first appearance", () => {
    expect(kmeans(points, 2, 1, 5).labels).toEqual([0, 0, 1, 1, 0, 1]);
    expect(silhouette(points, [0, 0, 1, 1, 0, 1])).toBeGreaterThan(0.9);
  });

  it("is deterministic, handles coinciding points, and refuses impossible requests", () => {
    expect(kmeans(points, 3, 7, 10)).toEqual(kmeans(points, 3, 7, 10));
    expect(kmeans([[1], [1], [1]], 2, 1, 3).labels).toHaveLength(3);
    expect(() => kmeans(points, 7, 1, 1)).toThrow();
    expect(silhouette(points, [0, 0, 0, 0, 0, 0])).toBe(0);
  });
});

describe("value-iteration agent", () => {
  const options = { minChanged: 2, maxChanged: 4, horizon: 6, stepCost: PLAN_ENGINE.agentStepCost };

  it("has 14 actions: 13 levels plus stop", () => {
    expect(N_ACTIONS).toBe(14);
  });

  it("always equals the restricted argmax, including when the best config is outside 2-4 changes", () => {
    const r = createRng(3);
    for (let i = 0; i < 500; i++) {
      const w = Array.from({ length: 8 }, () => (r.next() - 0.5) * 8);
      if (topGap(w, 2, 4) < 1e-4) continue;
      expect(solveMdp(w, options).finalConfig).toBe(restrictedArgmax(w, 2, 4));
    }
  });

  it("is restricted to 2-4 changes when every change is good or every change is bad", () => {
    const good = new Array(8).fill(1);
    const bad = new Array(8).fill(-1);
    expect(numChanged(unrestrictedArgmax(good))).toBe(5);
    expect(numChanged(solveMdp(good, options).finalConfig)).toBe(4);
    expect(unrestrictedArgmax(bad)).toBe(BASE_CONFIG_ID);
    expect(numChanged(solveMdp(bad, options).finalConfig)).toBe(2);
  });

  it("takes no more steps than needed and stays within the horizon", () => {
    const w = [0, 3, 0, 0, 0, 3, -1, -1];
    const result = solveMdp(w, options);
    expect(result.finalConfig).toBe("grid3-default-summary-light-sidebar");
    expect(result.path).toHaveLength(2);
    expect(result.path.at(-1)).toBe(result.finalConfig);
  });
});

describe("leave-one-out engine", { timeout: 120_000 }, () => {
  const people = cohort(9);

  it("never lets a participant's own trials reach their global or cluster prior", () => {
    const target = people[3]!;
    const flipped = { ...target, trials: target.trials.map((t) => ({ ...t, choice: t.choice === "left" ? "right" : "left" })) };
    const original = computePlans(people).participants.find((p) => p.code === target.code)!;
    const changed = computePlans(people.map((p) => (p.code === target.code ? flipped : p))).participants.find((p) => p.code === target.code)!;
    expect(changed.globalW).toEqual(original.globalW);
    expect(changed.sigma).toBe(original.sigma);
    expect(changed.nuisance).toEqual(original.nuisance);
    expect(changed.personalW).not.toEqual(original.personalW);
  });

  it("does let a participant's trials reach other people's models", () => {
    const flipped = { ...people[3]!, trials: people[3]!.trials.map((t) => ({ ...t, choice: t.choice === "left" ? "right" : "left" })) };
    const other = people[4]!.code;
    const a = computePlans(people).participants.find((p) => p.code === other)!;
    const b = computePlans(people.map((p, i) => (i === 3 ? flipped : p))).participants.find((p) => p.code === other)!;
    expect(a.globalW).not.toEqual(b.globalW);
  });

  it("assigns the cluster and fine-tunes using only the first 5 main trials", () => {
    const target = people[2]!;
    const laterChanged = { ...target, trials: target.trials.map((t, i) => (i < 5 ? t : { ...t, choice: t.choice === "left" ? "right" : "left" })) };
    const a = computePlans(people).participants.find((p) => p.code === target.code)!;
    const b = computePlans(people.map((p) => (p.code === target.code ? laterChanged : p))).participants.find((p) => p.code === target.code)!;
    expect(b.assignedCluster).toBe(a.assignedCluster);
    expect(b.cluster5W).toEqual(a.cluster5W);
  });

  it("restricts adaptive targets to 2-4 changed settings and keeps static at the base", () => {
    for (const p of computePlans(people).participants) {
      expect(p.targets.static).toBe(BASE_CONFIG_ID);
      for (const c of ["global", "cluster5", "personalFull"] as const) {
        const changed = numChanged(p.targets[c]);
        expect(changed).toBeGreaterThanOrEqual(2);
        expect(changed).toBeLessThanOrEqual(4);
      }
      expect(p.agent.matches).toBe(true);
      expect(p.flags.agentMismatch).toBe(false);
    }
  });

  it("is deterministic for the same data, whatever order the people arrive in", () => {
    const a = computePlans(people);
    expect(computePlans(people)).toEqual(a);
    expect(computePlans([...people].reverse())).toEqual(a);
  });

  it("gives valid plan files, each with one 8-second step in every adaptive condition", () => {
    for (const p of computePlans(people).participants) {
      const file = planFile(p);
      expect(validatePlanFile(file).ok).toBe(true);
      expect(file.conditions.static.steps).toEqual([]);
      for (const c of ["global", "cluster5", "personalFull"] as const) {
        expect(file.conditions[c].steps).toEqual([{ trigger: { type: "afterMs", value: 8000 }, config: p.targets[c] }]);
      }
    }
    expect(validatePlanFile(planFile({ code: "P3-S012", targets: computePlans(people).participants[0]!.targets })).ok).toBe(true);
  });

  it("builds plans for people outside the training data from the pool, which never saw them", () => {
    const outside = simulate("P3-050", 7, PROFILES[1]!);
    const result = computePlans(people, [outside]);
    const models = result.participants.find((p) => p.code === "P3-050")!;
    expect(models.basis).toBe("pool");
    expect(models.globalW).toEqual(computePlans(people).pool.globalW);
    expect(planFromPool(outside, result.pool).targets).toEqual(models.targets);
  });
});

describe("small numbers", { timeout: 60_000 }, () => {
  it.each([1, 2, 3, 5, 7])("uses one cluster and never crashes with %i participants", (n) => {
    const result = computePlans(cohort(n));
    expect(result.participants).toHaveLength(n);
    expect(result.warnings.join()).toMatch(/1 cluster/);
    for (const p of result.participants) {
      expect(p.clusterCount).toBe(1);
      expect(p.assignedCluster).toBe(0);
      expect(p.clusterW).toEqual(p.globalW);
    }
  });

  it("uses more than one cluster from 8 participants, with no warning", () => {
    const result = computePlans(cohort(8));
    expect(result.warnings).toEqual([]);
    expect(PLAN_ENGINE.clusterCandidates).toContain(result.pool.clusterWeights.length);
  });

  it("falls back to the default sigma with too few people to tune it", () => {
    const small = new Map(cohort(3).map((p) => [p.code, comparisons(p.trials)]));
    expect(selectSigma(small, NO_NUISANCE, false)).toBe(PLAN_ENGINE.fallbackSigma);
  });
});

describe("helpers shared with Python", () => {
  it("hashes text with FNV-1a", () => {
    expect(hashSeed("")).toBe(0x811c9dc5);
    expect(hashSeed("a")).toBe(0xe40c292c);
  });

  it("splits into a test set and a chronological training pool", () => {
    const { test, pool } = makeSplit(70, 20, 5);
    expect(test).toHaveLength(20);
    expect(pool).toHaveLength(50);
    expect(pool).toEqual([...pool].sort((a, b) => a - b));
    expect(new Set([...test, ...pool]).size).toBe(70);
  });

  it("assigns the cluster with the highest likelihood, using shared models from others only", () => {
    const data = comparisons(simulate("x", 11, PROFILES[0]!).trials);
    const others = new Map(cohort(6).map((p) => [p.code, comparisons(p.trials)]));
    const shared = buildShared(others, 2, NO_NUISANCE, true, 1);
    const assigned = assignByLikelihood(first(data, 70), shared.clusterWeights, NO_NUISANCE);
    const values = shared.clusterWeights.map((w) => logLikelihood(first(data, 70), w, NO_NUISANCE));
    expect(values[assigned]).toBe(Math.max(...values));
  });
});
