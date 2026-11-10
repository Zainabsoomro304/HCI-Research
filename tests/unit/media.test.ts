import { describe, expect, it } from "vitest";
import { CLIP_SCENES, LANGUAGES } from "@/config/shop";
import { ALL_CONFIG_IDS } from "@/config/uiSpace";
import { clipKey, clipUrl, stillKey, stillUrl } from "@/lib/media";

describe("opaque media names", () => {
  it("never reveal the config, scene or language", () => {
    const id = "xlarge-large-raised-iconText-high-list-hints";
    for (const url of [clipUrl(id, "dairy", "ur"), stillUrl(id, "en")]) {
      expect(url).toMatch(/^\/m\/[0-9a-f]{20}\.(mp4|jpg)$/);
      for (const part of [...id.split("-"), "dairy", "ur"]) expect(url).not.toContain(part);
    }
  });

  it("are unique for every clip (target x scene x language) and every still (config x language)", () => {
    const clips = new Set(ALL_CONFIG_IDS.flatMap((id) => CLIP_SCENES.flatMap((s) => LANGUAGES.map((l) => clipKey(id, s, l)))));
    expect(clips.size).toBe(ALL_CONFIG_IDS.length * CLIP_SCENES.length * LANGUAGES.length);
    const stills = new Set(ALL_CONFIG_IDS.flatMap((id) => LANGUAGES.map((l) => stillKey(id, l))));
    expect(stills.size).toBe(ALL_CONFIG_IDS.length * LANGUAGES.length);
  });

  it("are stable", () => {
    expect(clipKey("standard-standard-flat-iconOnly-standard-grid3-none", "grains", "en")).toBe(clipKey("standard-standard-flat-iconOnly-standard-grid3-none", "grains", "en"));
    expect(clipKey("standard-standard-flat-iconOnly-standard-grid3-none", "grains", "en")).not.toBe(clipKey("standard-standard-flat-iconOnly-standard-grid3-none", "grains", "ur"));
  });
});
