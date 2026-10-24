import { CONDITIONS, type Condition } from "@/config/study";
import { TASK_IDS } from "./tasks";

/**
 * 4x4 balanced Latin square (Williams design): every element appears once in every position, and every
 * element immediately follows every other element exactly once (first-order carry-over balance).
 */
export const BALANCED_LATIN_SQUARE_4: readonly (readonly number[])[] = [
  [0, 1, 3, 2],
  [1, 2, 0, 3],
  [2, 3, 1, 0],
  [3, 0, 2, 1],
];

/**
 * Condition order uses row (n-1) mod 4; task order uses row floor((n-1)/4) mod 4 of a second square.
 * Over every 16 consecutive participants all 16 row combinations occur once, so each condition is paired
 * with each task equally often (conditions and tasks are not confounded). Admin overrides take precedence.
 */
export function latinRows(participantNumber: number, overrides?: { conditionRow?: number | null; taskRow?: number | null }) {
  const n = participantNumber - 1;
  return {
    conditionRow: overrides?.conditionRow ?? ((n % 4) + 4) % 4,
    taskRow: overrides?.taskRow ?? (Math.floor(n / 4) % 4),
  };
}

export interface BlockAssignment {
  blockIndex: number;
  condition: Condition;
  taskId: string;
}

export function blockAssignments(conditionRow: number, taskRow: number, taskIds: readonly string[] = TASK_IDS): BlockAssignment[] {
  const cRow = BALANCED_LATIN_SQUARE_4[conditionRow];
  const tRow = BALANCED_LATIN_SQUARE_4[taskRow];
  if (!cRow || !tRow) throw new Error("Latin square rows must be 0-3");
  return [0, 1, 2, 3].map((pos) => ({ blockIndex: pos, condition: CONDITIONS[cRow[pos]!]!, taskId: taskIds[tRow[pos]!]! }));
}
