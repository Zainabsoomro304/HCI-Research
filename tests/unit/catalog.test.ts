import { describe, expect, it } from "vitest";
import rawCatalog from "@data/catalog.json";
import { BRAND_WORDS } from "@/config/brandWords";
import { CATEGORIES, CLIP_SCENES, SCENE_PRODUCT_COUNT, formatPrice } from "@/config/shop";
import { CatalogSchema, catalogProblems, catalogStats, iconOf, matchesQuery, parseCatalog, productsById, sceneProductIds } from "@/lib/catalog";
import { hasIcon } from "@/lib/productArt";

const base = structuredClone(rawCatalog) as { products: Record<string, unknown>[] };

describe("grocery catalogue", () => {
  it("accepts the shipped catalogue: 120 products, 15 in each of the 8 categories", () => {
    const cat = parseCatalog(rawCatalog);
    expect(cat.products).toHaveLength(120);
    expect(catalogProblems(cat, { minPerCategory: 15, brandWords: BRAND_WORDS })).toEqual([]);
    const stats = catalogStats(cat);
    expect(stats.perCategory.map((c) => c.category)).toEqual([...CATEGORIES]);
    for (const c of stats.perCategory) expect(c.count).toBe(15);
  });

  it("has complete English and Urdu fields and an illustration for every product", () => {
    for (const p of parseCatalog(rawCatalog).products) {
      expect(hasIcon(iconOf(p.imageId))).toBe(true);
      for (const f of ["name_ur", "unitLabel_ur", "description_ur"] as const) expect(p[f]).toMatch(/[؀-ۿ]/);
      expect(Number.isInteger(p.price)).toBe(true);
    }
  });

  it("flags missing Urdu, brand names and thin categories", () => {
    const cat = parseCatalog(rawCatalog);
    const latinUrdu = { products: cat.products.map((p, i) => (i === 0 ? { ...p, name_ur: "Bananas" } : p)) };
    expect(catalogProblems(latinUrdu).some((m) => m.includes("name_ur"))).toBe(true);
    const branded = { products: cat.products.map((p, i) => (i === 0 ? { ...p, name_en: "Nestle milk" } : p)) };
    expect(catalogProblems(branded, { brandWords: BRAND_WORDS }).length).toBeGreaterThanOrEqual(BRAND_WORDS.some((w) => "nestle milk".includes(w.toLowerCase())) ? 1 : 0);
    expect(catalogProblems(cat, { minPerCategory: 16 })).toHaveLength(8);
  });

  it("rejects duplicate ids, non-integer prices, bad ratings and unknown categories", () => {
    const dup = structuredClone(base);
    dup.products[1]!.id = dup.products[0]!.id;
    expect(CatalogSchema.safeParse(dup).success).toBe(false);
    for (const patch of [{ price: 9.5 }, { rating: 5.2 }, { rating: 4.25 }, { category: "toys" }, { imageId: "sack" }, { name_ur: "" }]) {
      const bad = structuredClone(base);
      Object.assign(bad.products[0]!, patch);
      expect(CatalogSchema.safeParse(bad).success, JSON.stringify(patch)).toBe(false);
    }
  });

  it("gives every clip scene a fixed set of products from its own category", () => {
    for (const scene of CLIP_SCENES) {
      const ids = sceneProductIds(scene);
      expect(ids).toHaveLength(SCENE_PRODUCT_COUNT);
      for (const id of ids) expect(productsById.get(id)!.category).toBe(scene);
    }
  });

  it("searches names in both languages", () => {
    const rice = productsById.get("gr-02")!;
    expect(matchesQuery(rice, "basmati")).toBe(true);
    expect(matchesQuery(rice, "باسمتی")).toBe(true);
    expect(matchesQuery(rice, "milk")).toBe(false);
  });
});

describe("prices in rupees", () => {
  it("use Western digits in both languages", () => {
    expect(formatPrice(1250, "en")).toBe("Rs 1,250");
    expect(formatPrice(1250, "ur")).toBe("1,250 روپے");
  });
});
