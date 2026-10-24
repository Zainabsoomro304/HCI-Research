import { describe, expect, it } from "vitest";
import rawCatalog from "@data/catalog.json";
import { CatalogSchema, catalogProblems, catalogStats, iconOf, parseCatalog } from "@/lib/catalog";
import { CATEGORIES } from "@/config/shop";
import { hasIcon } from "@/lib/productArt";
import { BRAND_WORDS } from "@/config/brandWords";

const base = structuredClone(rawCatalog) as { products: Record<string, unknown>[] };

describe("catalogue validator", () => {
  it("accepts the shipped catalogue", () => {
    const cat = parseCatalog(rawCatalog);
    expect(cat.products).toHaveLength(90);
    expect(catalogProblems(cat, { minPerCategory: 15, brandWords: BRAND_WORDS })).toEqual([]);
  });

  it("has 15 products in each of the 6 categories", () => {
    const stats = catalogStats(parseCatalog(rawCatalog));
    expect(stats.perCategory.map((c) => c.category)).toEqual([...CATEGORIES]);
    for (const c of stats.perCategory) expect(c.count).toBe(15);
  });

  it("has an icon drawing for every product", () => {
    for (const p of parseCatalog(rawCatalog).products) expect(hasIcon(iconOf(p.imageId))).toBe(true);
  });

  it("rejects duplicate ids", () => {
    const bad = structuredClone(base);
    bad.products[1]!.id = bad.products[0]!.id;
    expect(CatalogSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-integer prices, out-of-range ratings and unknown categories", () => {
    for (const patch of [{ price: 9.5 }, { rating: 5.2 }, { rating: 4.25 }, { category: "Toys" }, { imageId: "lamp" }]) {
      const bad = structuredClone(base);
      Object.assign(bad.products[0]!, patch);
      expect(CatalogSchema.safeParse(bad).success, JSON.stringify(patch)).toBe(false);
    }
  });

  it("flags brand names and thin categories", () => {
    const cat = parseCatalog(rawCatalog);
    const branded = { products: cat.products.map((p, i) => (i === 0 ? { ...p, name: "Nike Socks" } : p)) };
    expect(catalogProblems(branded, { brandWords: BRAND_WORDS }).some((m) => m.includes("nike"))).toBe(true);
    expect(catalogProblems(cat, { minPerCategory: 16 })).toHaveLength(6);
  });
});
