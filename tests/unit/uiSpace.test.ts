import { describe, expect, it } from "vitest";
import {
  ALL_CONFIG_IDS,
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_ID,
  allConfigs,
  fromConfigId,
  isConfigId,
  numChangedSettings,
  toConfigId,
} from "@/config/uiSpace";

describe("uiSpace", () => {
  it("has exactly 108 unique configurations", () => {
    expect(allConfigs()).toHaveLength(108);
    expect(new Set(ALL_CONFIG_IDS).size).toBe(108);
  });

  it("round-trips every config through its ID", () => {
    for (const config of allConfigs()) {
      const id = toConfigId(config);
      expect(fromConfigId(id)).toEqual(config);
      expect(toConfigId(fromConfigId(id))).toBe(id);
    }
  });

  it("uses the canonical layout-fontSize-density-theme-menu order", () => {
    expect(toConfigId({ layout: "grid3", fontSize: "large", density: "partial", theme: "dark", menu: "dropdown" })).toBe(
      "grid3-large-partial-dark-dropdown",
    );
    expect(DEFAULT_CONFIG_ID).toBe("list-default-detailed-light-sidebar");
    expect(fromConfigId(DEFAULT_CONFIG_ID)).toEqual(DEFAULT_CONFIG);
  });

  it("rejects malformed IDs", () => {
    for (const bad of ["", "grid3", "grid4-large-partial-dark-dropdown", "grid3-large-partial-dark-dropdown-x", "large-grid3-partial-dark-dropdown"]) {
      expect(isConfigId(bad)).toBe(false);
      expect(() => fromConfigId(bad)).toThrow();
    }
  });
});

describe("numChangedSettings", () => {
  it("counts settings that differ from the base", () => {
    expect(numChangedSettings(DEFAULT_CONFIG)).toBe(0);
    expect(numChangedSettings(fromConfigId("grid3-large-partial-dark-dropdown"))).toBe(5);
    expect(numChangedSettings(fromConfigId("list-default-detailed-dark-sidebar"))).toBe(1);
    expect(numChangedSettings(fromConfigId("grid2-small-detailed-light-dropdown"))).toBe(3);
  });

  it("matches the combinatorial distribution over the 108 configs", () => {
    const dist = [0, 0, 0, 0, 0, 0];
    for (const c of allConfigs()) dist[numChangedSettings(c)]!++;
    expect(dist).toEqual([1, 8, 25, 38, 28, 8]);
  });
});
