import type { ComparisonTrial } from "@prisma/client";

export interface QualityMetrics {
  /** Attention checks exist only in sessions started before 2026-11-23. Reported as recorded; never used to flag anyone. */
  attentionTotal: number;
  attentionAnswered: number;
  attentionCorrect: number;
  repeatsAnswered: number;
  repeatsConsistent: number;
  /** % of answered repeats where the same clip was chosen as in the original trial (null if none answered). */
  consistencyPct: number | null;
}

type T = Pick<ComparisonTrial, "id" | "isAttentionCheck" | "isRepeat" | "repeatOfTrialId" | "choice" | "chosenClipId">;

/** Self-consistency (and, for older sessions, attention-check answers) for a set of comparison trials. */
export function computeQuality(trials: readonly T[]): QualityMetrics {
  const byId = new Map(trials.map((t) => [t.id, t]));
  const attention = trials.filter((t) => t.isAttentionCheck);
  const answeredAttention = attention.filter((t) => t.choice !== null);
  // The attention-check instruction is "please choose B", i.e. the right-hand clip.
  const correct = answeredAttention.filter((t) => t.choice === "right").length;
  let repeatsAnswered = 0;
  let repeatsConsistent = 0;
  for (const r of trials) {
    if (!r.isRepeat || !r.chosenClipId || !r.repeatOfTrialId) continue;
    const o = byId.get(r.repeatOfTrialId);
    if (!o?.chosenClipId) continue;
    repeatsAnswered++;
    if (o.chosenClipId === r.chosenClipId) repeatsConsistent++;
  }
  return {
    attentionTotal: attention.length,
    attentionAnswered: answeredAttention.length,
    attentionCorrect: correct,
    repeatsAnswered,
    repeatsConsistent,
    consistencyPct: repeatsAnswered ? Math.round((repeatsConsistent / repeatsAnswered) * 1000) / 10 : null,
  };
}
