/**
 * The preference model: Bradley-Terry / logistic regression fitted by MAP, ported from analysis/src/hci/model.py.
 *
 *   P(choose left) = sigmoid( w . (x_left - x_right) + betaSide + kappa . (curv_left - curv_right) )
 *
 * w holds the 8 preference weights, relative to the base level of each setting. betaSide and kappa are global nuisance
 * terms and are never part of a config's score. Linear busyness is absent: it is the exact sum of the 8 dummies, so it
 * cannot be separated from w. A Gaussian prior w ~ N(mu, sigma^2 I) is the starting point: with no comparisons the
 * estimate is mu, and each comparison pulls it towards the person's own preferences.
 */
import { SETTING_KEYS } from "@/config/uiSpace";

/** Levels with the base first. The order fixes the features and the order of configs when breaking exact ties. */
export const SETTINGS: Record<(typeof SETTING_KEYS)[number], readonly string[]> = {
  layout: ["list", "grid2", "grid3"],
  fontSize: ["default", "small", "large"],
  density: ["detailed", "partial", "summary"],
  theme: ["light", "dark"],
  menu: ["sidebar", "dropdown"],
};
export const FEATURES = SETTING_KEYS.flatMap((k) => SETTINGS[k].slice(1));
export const N_FEATURES = FEATURES.length;
export const BASE_CONFIG_ID = SETTING_KEYS.map((k) => SETTINGS[k][0]).join("-");

function buildAllConfigs(): string[] {
  let ids = [""];
  for (const k of SETTING_KEYS) ids = ids.flatMap((prefix) => SETTINGS[k].map((level) => (prefix ? `${prefix}-${level}` : level)));
  return ids;
}
export const ALL_CONFIG_IDS: readonly string[] = buildAllConfigs();

export function encode(configId: string): number[] {
  const parts = configId.split("-");
  if (parts.length !== SETTING_KEYS.length) throw new Error(`Invalid config ID ${configId}`);
  const x: number[] = [];
  SETTING_KEYS.forEach((k, i) => {
    const levels = SETTINGS[k];
    if (!levels.includes(parts[i]!)) throw new Error(`Invalid config ID ${configId}`);
    for (const level of levels.slice(1)) x.push(parts[i] === level ? 1 : 0);
  });
  return x;
}

export function numChanged(configId: string): number {
  return encode(configId).reduce((a, b) => a + b, 0);
}

const X = new Map(ALL_CONFIG_IDS.map((id) => [id, encode(id)]));
const CURV = new Map(ALL_CONFIG_IDS.map((id) => [id, (numChanged(id) - 3) ** 2]));

export interface Nuisance {
  betaSide: number;
  kappa: number;
}
export const NO_NUISANCE: Nuisance = { betaSide: 0, kappa: 0 };

/** One person's (or group's) comparisons in chronological order. y = 1 when the left clip was chosen. */
export interface Comparisons {
  n: number;
  dx: Float64Array; // n x N_FEATURES, row by row
  dcurv: Float64Array;
  y: Float64Array;
}

export function comparisons(trials: readonly { left: string; right: string; choice: string }[]): Comparisons {
  const n = trials.length;
  const dx = new Float64Array(n * N_FEATURES);
  const dcurv = new Float64Array(n);
  const y = new Float64Array(n);
  trials.forEach((t, i) => {
    const a = X.get(t.left);
    const b = X.get(t.right);
    if (!a || !b) throw new Error(`Unknown clip in ${t.left} / ${t.right}`);
    for (let j = 0; j < N_FEATURES; j++) dx[i * N_FEATURES + j] = a[j]! - b[j]!;
    dcurv[i] = CURV.get(t.left)! - CURV.get(t.right)!;
    y[i] = t.choice === "left" ? 1 : 0;
  });
  return { n, dx, dcurv, y };
}

export function take(data: Comparisons, indices: readonly number[]): Comparisons {
  const n = indices.length;
  const dx = new Float64Array(n * N_FEATURES);
  const dcurv = new Float64Array(n);
  const y = new Float64Array(n);
  indices.forEach((source, i) => {
    dx.set(data.dx.subarray(source * N_FEATURES, (source + 1) * N_FEATURES), i * N_FEATURES);
    dcurv[i] = data.dcurv[source]!;
    y[i] = data.y[source]!;
  });
  return { n, dx, dcurv, y };
}

export function first(data: Comparisons, k: number): Comparisons {
  const n = Math.min(k, data.n);
  return { n, dx: data.dx.subarray(0, n * N_FEATURES), dcurv: data.dcurv.subarray(0, n), y: data.y.subarray(0, n) };
}

export function concat(parts: readonly Comparisons[]): Comparisons {
  const n = parts.reduce((a, p) => a + p.n, 0);
  const dx = new Float64Array(n * N_FEATURES);
  const dcurv = new Float64Array(n);
  const y = new Float64Array(n);
  let at = 0;
  for (const p of parts) {
    dx.set(p.dx, at * N_FEATURES);
    dcurv.set(p.dcurv, at);
    y.set(p.y, at);
    at += p.n;
  }
  return { n, dx, dcurv, y };
}

/** log(1 + exp(x)) without overflow. */
function softplus(x: number): number {
  return x > 0 ? x + Math.log1p(Math.exp(-x)) : Math.log1p(Math.exp(x));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function linear(data: Comparisons, w: readonly number[] | Float64Array, nuisance: Nuisance): Float64Array {
  const eta = new Float64Array(data.n);
  for (let i = 0; i < data.n; i++) {
    let s = nuisance.betaSide + nuisance.kappa * data.dcurv[i]!;
    const row = i * N_FEATURES;
    for (let j = 0; j < N_FEATURES; j++) s += data.dx[row + j]! * w[j]!;
    eta[i] = s;
  }
  return eta;
}

export function logLikelihood(data: Comparisons, w: readonly number[] | Float64Array, nuisance: Nuisance = NO_NUISANCE): number {
  const eta = linear(data, w, nuisance);
  let total = 0;
  for (let i = 0; i < data.n; i++) total -= softplus(data.y[i] === 1 ? -eta[i]! : eta[i]!);
  return total;
}

/** Solves A x = b for a symmetric positive definite A (Cholesky). A is overwritten. */
function solveSpd(A: Float64Array, b: Float64Array, size: number): Float64Array {
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * size + j]!;
      for (let k = 0; k < j; k++) s -= A[i * size + k]! * A[j * size + k]!;
      if (i === j) {
        if (s <= 0) throw new Error("Hessian is not positive definite");
        A[i * size + i] = Math.sqrt(s);
      } else A[i * size + j] = s / A[j * size + j]!;
    }
  }
  const x = Float64Array.from(b);
  for (let i = 0; i < size; i++) {
    for (let k = 0; k < i; k++) x[i]! -= A[i * size + k]! * x[k]!;
    x[i] = x[i]! / A[i * size + i]!;
  }
  for (let i = size - 1; i >= 0; i--) {
    for (let k = i + 1; k < size; k++) x[i]! -= A[k * size + i]! * x[k]!;
    x[i] = x[i]! / A[i * size + i]!;
  }
  return x;
}

/** MAP weights under w ~ N(mu, sigma^2 I), by damped Newton. The objective is strictly convex. */
export function fitMap(data: Comparisons, opts: { mu?: readonly number[]; sigma: number; nuisance?: Nuisance; maxIter?: number; tol?: number }): number[] {
  const mu = opts.mu ?? new Array<number>(N_FEATURES).fill(0);
  if (data.n === 0) return [...mu];
  const nuisance = opts.nuisance ?? NO_NUISANCE;
  const maxIter = opts.maxIter ?? 100;
  const tol = opts.tol ?? 1e-8;
  const precision = 1 / opts.sigma ** 2;

  const objective = (w: Float64Array) => {
    let penalty = 0;
    for (let j = 0; j < N_FEATURES; j++) penalty += (w[j]! - mu[j]!) ** 2;
    return -logLikelihood(data, w, nuisance) + 0.5 * precision * penalty;
  };

  // Each comparison touches only a few features, so the Hessian is built from the non-zero entries alone.
  const rowStart = new Int32Array(data.n + 1);
  const nonZero: number[] = [];
  for (let i = 0; i < data.n; i++) {
    for (let j = 0; j < N_FEATURES; j++) if (data.dx[i * N_FEATURES + j] !== 0) nonZero.push(j);
    rowStart[i + 1] = nonZero.length;
  }

  let w: Float64Array = Float64Array.from(mu);
  let value = objective(w);
  const hess = new Float64Array(N_FEATURES * N_FEATURES);
  const grad = new Float64Array(N_FEATURES);
  for (let iter = 0; iter < maxIter; iter++) {
    const eta = linear(data, w, nuisance);
    hess.fill(0);
    for (let j = 0; j < N_FEATURES; j++) grad[j] = precision * (w[j]! - mu[j]!);
    for (let i = 0; i < data.n; i++) {
      const p = sigmoid(eta[i]!);
      const residual = p - data.y[i]!;
      const weight = p * (1 - p);
      const row = i * N_FEATURES;
      for (let ia = rowStart[i]!; ia < rowStart[i + 1]!; ia++) {
        const a = nonZero[ia]!;
        const da = data.dx[row + a]!;
        grad[a]! += da * residual;
        for (let ib = rowStart[i]!; ib <= ia; ib++) {
          const b = nonZero[ib]!;
          hess[a * N_FEATURES + b]! += weight * da * data.dx[row + b]!;
        }
      }
    }
    let largest = 0;
    for (let j = 0; j < N_FEATURES; j++) largest = Math.max(largest, Math.abs(grad[j]!));
    if (largest < tol) break;
    for (let j = 0; j < N_FEATURES; j++) hess[j * N_FEATURES + j]! += precision;
    const step = solveSpd(hess, grad, N_FEATURES);
    let scale = 1;
    let accepted: Float64Array | null = null;
    let acceptedValue = value;
    while (scale > 1e-6) {
      const candidate = new Float64Array(N_FEATURES);
      for (let j = 0; j < N_FEATURES; j++) candidate[j] = w[j]! - scale * step[j]!;
      const next = objective(candidate);
      if (next <= value) {
        accepted = candidate;
        acceptedValue = next;
        break;
      }
      scale /= 2;
    }
    if (!accepted) break;
    w = accepted;
    value = acceptedValue;
  }
  return [...w];
}

/** A group's pooled weights: one model fitted to all of the group's comparisons, under a weak prior. */
export function fitPooled(parts: readonly Comparisons[], sigmaPool: number, nuisance: Nuisance = NO_NUISANCE): number[] {
  return fitMap(concat(parts), { sigma: sigmaPool, nuisance });
}

/** Newton fit of betaSide (and kappa) with the person-level linear predictor held fixed. */
function fitOffsetTerms(data: Comparisons, personEta: Float64Array, useCurvature: boolean): Nuisance {
  const size = useCurvature ? 2 : 1;
  const theta = new Float64Array(size);
  for (let iter = 0; iter < 50; iter++) {
    const grad = new Float64Array(size);
    const hess = new Float64Array(size * size);
    for (let i = 0; i < data.n; i++) {
      const c = data.dcurv[i]!;
      const p = sigmoid(theta[0]! + (useCurvature ? theta[1]! * c : 0) + personEta[i]!);
      const residual = p - data.y[i]!;
      const weight = p * (1 - p);
      grad[0]! += residual;
      hess[0]! += weight;
      if (useCurvature) {
        grad[1]! += c * residual;
        hess[2]! += weight * c;
        hess[3]! += weight * c * c;
      }
    }
    let largest = 0;
    for (let j = 0; j < size; j++) largest = Math.max(largest, Math.abs(grad[j]!));
    if (largest < 1e-8) break;
    for (let j = 0; j < size; j++) hess[j * size + j]! += 1e-8;
    const step = solveSpd(hess, grad, size);
    for (let j = 0; j < size; j++) theta[j]! -= step[j]!;
  }
  return { betaSide: theta[0]!, kappa: useCurvature ? theta[1]! : 0 };
}

/**
 * Alternates person-level weights and the global nuisance terms, so that person-to-person differences in w do not
 * attenuate betaSide and kappa as they would in a single pooled logistic fit.
 */
export function estimateNuisance(people: readonly Comparisons[], opts: { sigma: number; rounds: number; useCurvature: boolean }): Nuisance {
  if (people.length === 0) return NO_NUISANCE;
  let nuisance = NO_NUISANCE;
  const pooled = concat(people);
  for (let round = 0; round < opts.rounds; round++) {
    const eta = new Float64Array(pooled.n);
    let at = 0;
    for (const person of people) {
      const w = fitMap(person, { sigma: opts.sigma, nuisance });
      eta.set(linear(person, w, NO_NUISANCE), at);
      at += person.n;
    }
    nuisance = fitOffsetTerms(pooled, eta, opts.useCurvature);
  }
  return nuisance;
}

/** Score of a config: w . x only, never the nuisance terms. */
export function score(w: readonly number[], configId: string): number {
  const x = X.get(configId)!;
  let s = 0;
  for (let j = 0; j < N_FEATURES; j++) s += x[j]! * w[j]!;
  return s;
}
