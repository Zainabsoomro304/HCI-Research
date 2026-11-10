import { describe, expect, it } from "vitest";
import {
  ALL_CONFIG_IDS,
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_ID,
  SETTING_INFO,
  SETTING_KEYS,
  SETTING_LEVELS,
  allConfigs,
  fromConfigId,
  isConfigId,
  numChangedSettings,
  toConfigId,
} from "@/config/uiSpace";

describe("uiSpace", () => {
  it("has exactly 432 unique configurations from 7 settings", () => {
    expect(SETTING_KEYS).toEqual(["textSize", "targetSize", "buttonStyle", "iconLabels", "contrast", "layout", "guidance"]);
    expect(allConfigs()).toHaveLength(432);
    expect(new Set(ALL_CONFIG_IDS).size).toBe(432);
  });

  it("round-trips every config through its ID", () => {
    for (const config of allConfigs()) {
      const id = toConfigId(config);
      expect(fromConfigId(id)).toEqual(config);
      expect(toConfigId(fromConfigId(id))).toBe(id);
    }
  });

  it("uses the canonical key order, with the first level of every setting as the base", () => {
    expect(
      toConfigId({ textSize: "xlarge", targetSize: "large", buttonStyle: "raised", iconLabels: "iconText", contrast: "high", layout: "list", guidance: "hints" }),
    ).toBe("xlarge-large-raised-iconText-high-list-hints");
    expect(DEFAULT_CONFIG_ID).toBe("standard-standard-flat-iconOnly-standard-grid3-none");
    expect(fromConfigId(DEFAULT_CONFIG_ID)).toEqual(DEFAULT_CONFIG);
    for (const k of SETTING_KEYS) expect(DEFAULT_CONFIG[k]).toBe(SETTING_LEVELS[k][0]);
  });

  it("documents every setting and level with its HCI principle", () => {
    for (const k of SETTING_KEYS) {
      expect(SETTING_INFO[k].principle.length).toBeGreaterThan(5);
      expect(Object.keys(SETTING_INFO[k].levels)).toEqual([...SETTING_LEVELS[k]]);
    }
  });

  it("rejects malformed IDs", () => {
    for (const bad of ["", "standard", "huge-standard-flat-iconOnly-standard-grid3-none", "standard-standard-flat-iconOnly-standard-grid3-none-x", "standard-flat-standard-iconOnly-standard-grid3-none"]) {
      expect(isConfigId(bad)).toBe(false);
      expect(() => fromConfigId(bad)).toThrow();
    }
  });
});

describe("numChangedSettings", () => {
  it("counts settings that differ from the base", () => {
    expect(numChangedSettings(DEFAULT_CONFIG)).toBe(0);
    expect(numChangedSettings(fromConfigId("xlarge-large-raised-iconText-high-list-hints"))).toBe(7);
    expect(numChangedSettings(fromConfigId("large-standard-flat-iconOnly-standard-grid3-hints"))).toBe(2);
  });

  it("matches the combinatorial distribution (1 + 2t)^3 (1 + t)^4 over the 432 configs", () => {
    const dist = new Array(8).fill(0);
    for (const c of allConfigs()) dist[numChangedSettings(c)]!++;
    expect(dist).toEqual([1, 10, 42, 96, 129, 102, 44, 8]);
  });
});
