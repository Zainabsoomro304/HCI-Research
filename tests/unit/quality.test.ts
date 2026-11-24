import { describe, expect, it } from "vitest";
import { computeQuality } from "@/lib/admin/quality";

const t = (id: string, o: Partial<{ isAttentionCheck: boolean; isRepeat: boolean; repeatOfTrialId: string; choice: string; chosenClipId: string }> = {}) => ({
  id,
  isAttentionCheck: o.isAttentionCheck ?? false,
  isRepeat: o.isRepeat ?? false,
  repeatOfTrialId: o.repeatOfTrialId ?? null,
  choice: o.choice ?? null,
  chosenClipId: o.chosenClipId ?? null,
});

describe("quality metrics", () => {
  it("reports attention checks in older sessions as recorded, without flagging anyone", () => {
    const old = computeQuality([t("a1", { isAttentionCheck: true, choice: "right" }), t("a2", { isAttentionCheck: true, choice: "left" })]);
    expect(old).toMatchObject({ attentionTotal: 2, attentionAnswered: 2, attentionCorrect: 1 });
    expect(old).not.toHaveProperty("attentionFailed");
    expect(computeQuality([t("m1", { choice: "left", chosenClipId: "X" })])).toMatchObject({ attentionTotal: 0, attentionAnswered: 0 });
  });

  it("computes self-consistency as % of repeats choosing the same clip (sides are swapped in repeats)", () => {
    const q = computeQuality([
      t("o1", { choice: "left", chosenClipId: "X" }),
      t("r1", { isRepeat: true, repeatOfTrialId: "o1", choice: "right", chosenClipId: "X" }),
      t("o2", { choice: "left", chosenClipId: "Y" }),
      t("r2", { isRepeat: true, repeatOfTrialId: "o2", choice: "left", chosenClipId: "Z" }),
      t("o3", { choice: "left", chosenClipId: "Q" }),
      t("r3", { isRepeat: true, repeatOfTrialId: "o3" }),
    ]);
    expect(q).toMatchObject({ repeatsAnswered: 2, repeatsConsistent: 1, consistencyPct: 50 });
    expect(computeQuality([]).consistencyPct).toBeNull();
  });
});
