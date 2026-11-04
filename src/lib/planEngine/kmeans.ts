/**
 * K-means with k-means++ starts, plus the silhouette score. analysis/src/hci/kmeans.py is a line-for-line copy, using
 * the same random number generator, so both languages produce the same clusters.
 */
import { createRng } from "../random";

export interface KMeansResult {
  /** Cluster of each point. Clusters are numbered by first appearance in the point order. */
  labels: number[];
  centroids: number[][];
  inertia: number;
}

function squaredDistance(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let j = 0; j < a.length; j++) s += (a[j]! - b[j]!) ** 2;
  return s;
}

function plusPlusStarts(points: readonly number[][], k: number, next: () => number): number[][] {
  const n = points.length;
  const chosen = [Math.floor(next() * n)];
  const nearest = points.map((p) => squaredDistance(p, points[chosen[0]!]!));
  while (chosen.length < k) {
    const total = nearest.reduce((a, b) => a + b, 0);
    let index = -1;
    if (total > 0) {
      const target = next() * total;
      let cumulative = 0;
      for (let i = 0; i < n; i++) {
        cumulative += nearest[i]!;
        if (nearest[i]! > 0 && cumulative >= target) {
          index = i;
          break;
        }
      }
      if (index < 0) index = nearest.findLastIndex((d) => d > 0);
    } else {
      index = points.findIndex((_, i) => !chosen.includes(i)); // all remaining points coincide
    }
    chosen.push(index);
    for (let i = 0; i < n; i++) nearest[i] = Math.min(nearest[i]!, squaredDistance(points[i]!, points[index]!));
  }
  return chosen.map((i) => [...points[i]!]);
}

function lloyd(points: readonly number[][], start: number[][], maxIter = 100): KMeansResult {
  const n = points.length;
  const k = start.length;
  const dimensions = points[0]!.length;
  let centroids = start;
  let labels = new Array<number>(n).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    const assigned = points.map((p, i) => {
      let best = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < k; c++) {
        const d = squaredDistance(p, centroids[c]!);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      if (best !== labels[i]) changed = true;
      return best;
    });
    labels = assigned;
    if (!changed) break;
    const sums = Array.from({ length: k }, () => new Array<number>(dimensions).fill(0));
    const counts = new Array<number>(k).fill(0);
    points.forEach((p, i) => {
      counts[labels[i]!]!++;
      for (let j = 0; j < dimensions; j++) sums[labels[i]!]![j]! += p[j]!;
    });
    const updated = sums.map((sum, c) => (counts[c]! > 0 ? sum.map((v) => v / counts[c]!) : centroids[c]!));
    // An empty cluster restarts at the point farthest from its current centroid.
    for (let c = 0; c < k; c++) {
      if (counts[c]! > 0) continue;
      let farthest = 0;
      let distance = -1;
      points.forEach((p, i) => {
        const d = squaredDistance(p, updated[labels[i]!]!);
        if (d > distance) {
          distance = d;
          farthest = i;
        }
      });
      updated[c] = [...points[farthest]!];
      labels[farthest] = c;
    }
    centroids = updated;
  }
  const inertia = points.reduce((a, p, i) => a + squaredDistance(p, centroids[labels[i]!]!), 0);
  return { labels, centroids, inertia };
}

/** The lowest-inertia result of `inits` random starts, with clusters renumbered by first appearance. */
export function kmeans(points: readonly number[][], k: number, seed: number, inits: number): KMeansResult {
  if (k < 1 || k > points.length) throw new Error(`Cannot make ${k} clusters from ${points.length} points`);
  const rng = createRng(seed);
  let best: KMeansResult | null = null;
  for (let init = 0; init < inits; init++) {
    const result = lloyd(points, plusPlusStarts(points, k, rng.next));
    if (!best || result.inertia < best.inertia - 1e-12) best = result;
  }
  const order: number[] = [];
  for (const label of best!.labels) if (!order.includes(label)) order.push(label);
  for (let c = 0; c < k; c++) if (!order.includes(c)) order.push(c);
  return {
    labels: best!.labels.map((label) => order.indexOf(label)),
    centroids: order.map((c) => best!.centroids[c]!),
    inertia: best!.inertia,
  };
}

/** Mean silhouette over all points. A point alone in its cluster scores 0. */
export function silhouette(points: readonly number[][], labels: readonly number[]): number {
  const n = points.length;
  const clusters = [...new Set(labels)];
  if (clusters.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const sums = new Map<number, number>();
    const counts = new Map<number, number>();
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = Math.sqrt(squaredDistance(points[i]!, points[j]!));
      sums.set(labels[j]!, (sums.get(labels[j]!) ?? 0) + d);
      counts.set(labels[j]!, (counts.get(labels[j]!) ?? 0) + 1);
    }
    if (!counts.has(labels[i]!)) continue;
    const a = sums.get(labels[i]!)! / counts.get(labels[i]!)!;
    let b = Infinity;
    for (const c of clusters) if (c !== labels[i]) b = Math.min(b, sums.get(c)! / counts.get(c)!);
    const denominator = Math.max(a, b);
    if (denominator > 0) total += (b - a) / denominator;
  }
  return total / n;
}
