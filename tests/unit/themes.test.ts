import { describe, expect, it } from "vitest";
import { TARGET_PX, TEXT_SIZE_PX } from "@/config/shop";
import { CONTRAST_TOKENS, REQUIRED_RATIO, TEXT_PAIRS, contrastRatio, shopCssVars } from "@/config/themes";
import { SETTING_LEVELS, fromConfigId } from "@/config/uiSpace";

describe("contrast token sets", () => {
  it("have the same tokens", () => {
    expect(Object.keys(CONTRAST_TOKENS.standard).sort()).toEqual(Object.keys(CONTRAST_TOKENS.high).sort());
  });

  it("standard meets WCAG AA (4.5:1) and high meets WCAG AAA (7:1) for every text pair", () => {
    for (const level of SETTING_LEVELS.contrast) {
      const t = CONTRAST_TOKENS[level];
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrastRatio(t[fg] as string, t[bg] as string);
        expect(ratio, `${level}: ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(REQUIRED_RATIO[level]);
      }
    }
  });

  it("high contrast has stronger borders and focus outlines", () => {
    expect(contrastRatio(CONTRAST_TOKENS.high.border, CONTRAST_TOKENS.high.surface)).toBeGreaterThan(contrastRatio(CONTRAST_TOKENS.standard.border, CONTRAST_TOKENS.standard.surface));
    expect(parseInt(CONTRAST_TOKENS.high.focusWidth)).toBeGreaterThan(parseInt(CONTRAST_TOKENS.standard.focusWidth));
    expect(parseInt(CONTRAST_TOKENS.high.borderWidth)).toBeGreaterThan(parseInt(CONTRAST_TOKENS.standard.borderWidth));
  });
});

describe("text and target sizes", () => {
  it("text sizes grow per level, with Urdu scaled up separately", () => {
    for (const lang of ["en", "ur"] as const) {
      const [a, b, c] = SETTING_LEVELS.textSize.map((l) => TEXT_SIZE_PX[lang][l]);
      expect(a! < b! && b! < c!).toBe(true);
    }
    expect(TEXT_SIZE_PX.en).toEqual({ standard: 17, large: 20, xlarge: 24 });
    expect(TEXT_SIZE_PX.ur.standard).toBeGreaterThan(TEXT_SIZE_PX.en.standard);
  });

  it("targets are at least 36 px (standard) and 52 px (large)", () => {
    expect(TARGET_PX.standard.min).toBe(36);
    expect(TARGET_PX.large.min).toBe(52);
    expect(TARGET_PX.large.gap).toBeGreaterThan(TARGET_PX.standard.gap);
  });

  it("text size and target size vary independently", () => {
    const a = shopCssVars(fromConfigId("xlarge-standard-flat-iconOnly-standard-grid3-none"), "en") as Record<string, string>;
    const b = shopCssVars(fromConfigId("standard-large-flat-iconOnly-standard-grid3-none"), "en") as Record<string, string>;
    expect(a["--fs-base"]).toBe("24px");
    expect(a["--tap"]).toBe("36px");
    expect(b["--fs-base"]).toBe("17px");
    expect(b["--tap"]).toBe("52px");
  });

  it("Urdu uses a taller line for Nastaliq", () => {
    const config = fromConfigId("standard-standard-flat-iconOnly-standard-grid3-none");
    expect(Number((shopCssVars(config, "ur") as Record<string, string>)["--lh"])).toBeGreaterThan(Number((shopCssVars(config, "en") as Record<string, string>)["--lh"]) + 0.4);
  });
});
