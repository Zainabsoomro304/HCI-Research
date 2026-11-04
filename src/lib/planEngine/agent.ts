/**
 * The RL agent: it solves the adaptation MDP exactly by value iteration.
 *
 *   State: the current config (108 states).
 *   Actions: set one setting to one of its levels (13), or stop (1), for 14 in total.
 *   Reward: the score gain w . (x_new - x_old), minus a small cost per step.
 *   Episode: starts at the base config, at most `horizon` steps, and may only stop in an allowed config.
 *
 * The environment is small and fully known, so no sampling is needed. The step cost is tiny, so it stops pointless
 * moves and breaks exact ties without changing which config is best. The result is checked against a brute-force
 * search over the allowed configs by the caller.
 */
import { SETTING_KEYS } from "@/config/uiSpace";
import { ALL_CONFIG_IDS, BASE_CONFIG_ID, SETTINGS, numChanged, score } from "./model";

const INDEX = new Map(ALL_CONFIG_IDS.map((id, i) => [id, i]));

/** next[state][action] = the state reached by that action, or -1 when the action would change nothing. */
const TRANSITIONS: number[][] = ALL_CONFIG_IDS.map((id) => {
  const parts = id.split("-");
  const out: number[] = [];
  SETTING_KEYS.forEach((key, position) => {
    for (const level of SETTINGS[key]) {
      if (parts[position] === level) out.push(-1);
      else {
        const moved = [...parts];
        moved[position] = level;
        out.push(INDEX.get(moved.join("-"))!);
      }
    }
  });
  return out;
});
export const N_ACTIONS = TRANSITIONS[0]!.length + 1;

export interface AgentResult {
  finalConfig: string;
  /** The configs visited after the base config, in order. */
  path: string[];
}

export function solveMdp(w: readonly number[], opts: { minChanged: number; maxChanged: number; horizon: number; stepCost: number }): AgentResult {
  const states = ALL_CONFIG_IDS.length;
  const scores = ALL_CONFIG_IDS.map((id) => score(w, id));
  const allowed = ALL_CONFIG_IDS.map((id) => {
    const changed = numChanged(id);
    return changed >= opts.minChanged && changed <= opts.maxChanged;
  });
  // value[t][s]: best return with t steps left. Stopping is masked out in configs that are not allowed.
  const value: Float64Array[] = [Float64Array.from(allowed.map((ok) => (ok ? 0 : -Infinity)))];
  const policy: Int32Array[] = [new Int32Array(states).fill(-1)];
  for (let t = 1; t <= opts.horizon; t++) {
    const current = new Float64Array(states);
    const choice = new Int32Array(states);
    for (let s = 0; s < states; s++) {
      let best = allowed[s] ? 0 : -Infinity;
      let action = -1;
      const moves = TRANSITIONS[s]!;
      for (let a = 0; a < moves.length; a++) {
        const next = moves[a]!;
        if (next < 0) continue;
        const total = scores[next]! - scores[s]! - opts.stepCost + value[t - 1]![next]!;
        if (total > best + 1e-12) {
          best = total;
          action = a;
        }
      }
      current[s] = best;
      choice[s] = action;
    }
    value.push(current);
    policy.push(choice);
  }
  let state = INDEX.get(BASE_CONFIG_ID)!;
  const path: string[] = [];
  for (let t = opts.horizon; t >= 1; t--) {
    const action = policy[t]![state]!;
    if (action < 0) break;
    state = TRANSITIONS[state]![action]!;
    path.push(ALL_CONFIG_IDS[state]!);
  }
  return { finalConfig: ALL_CONFIG_IDS[state]!, path };
}

export function restrictedArgmax(w: readonly number[], minChanged: number, maxChanged: number): string {
  let best = "";
  let bestScore = -Infinity;
  for (const id of ALL_CONFIG_IDS) {
    const changed = numChanged(id);
    if (changed < minChanged || changed > maxChanged) continue;
    const s = score(w, id);
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return best;
}

export function unrestrictedArgmax(w: readonly number[]): string {
  let best = "";
  let bestScore = -Infinity;
  for (const id of ALL_CONFIG_IDS) {
    const s = score(w, id);
    if (s > bestScore) {
      bestScore = s;
      best = id;
    }
  }
  return best;
}

/** The gap in score between the best and second-best allowed configs. */
export function topGap(w: readonly number[], minChanged: number, maxChanged: number): number {
  let first = -Infinity;
  let second = -Infinity;
  for (const id of ALL_CONFIG_IDS) {
    const changed = numChanged(id);
    if (changed < minChanged || changed > maxChanged) continue;
    const s = score(w, id);
    if (s > first) {
      second = first;
      first = s;
    } else if (s > second) second = s;
  }
  return first - second;
}
