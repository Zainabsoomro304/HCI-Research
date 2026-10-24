import { describe, expect, it } from "vitest";
import { ALL_CONFIG_IDS } from "@/config/uiSpace";
import { clipUrl, mediaKey, mediaRewrites, stillUrl } from "@/lib/media";

describe("opaque media URLs", () => {
  it("never contain config IDs or setting names", () => {
    for (const id of ALL_CONFIG_IDS) {
      for (const url of [clipUrl(id), stillUrl(id)]) {
        expect(url).toMatch(/^\/m\/[0-9a-f]{16}\.(mp4|png)$/);
        for (const word of ["list", "grid", "dark", "light", "small", "large", "sidebar", "dropdown"]) expect(url).not.toContain(word);
      }
    }
  });
  it("are unique and map back to the right files", () => {
    expect(new Set(ALL_CONFIG_IDS.map(mediaKey)).size).toBe(108);
    const r = mediaRewrites(["grid3-large-partial-dark-dropdown"]);
    expect(r).toContainEqual({ source: clipUrl("grid3-large-partial-dark-dropdown"), destination: "/clips/grid3-large-partial-dark-dropdown.mp4" });
  });
});
