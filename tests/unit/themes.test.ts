import { describe, expect, it } from "vitest";
import { TEXT_PAIRS, THEME_TOKENS, contrastRatio } from "@/config/themes";
import { THEMES } from "@/config/uiSpace";

describe("theme tokens", () => {
  it("define the same complete token set for both themes", () => {
    expect(Object.keys(THEME_TOKENS.light).sort()).toEqual(Object.keys(THEME_TOKENS.dark).sort());
  });

  for (const theme of THEMES) {
    it(`meet WCAG AA (4.5:1) for every text pair in ${theme}`, () => {
      const t = THEME_TOKENS[theme];
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrastRatio(t[fg], t[bg]);
        expect(ratio, `${theme}: ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
