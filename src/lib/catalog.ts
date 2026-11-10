import { z } from "zod";
import { CATEGORIES, SCENE_PRODUCT_COUNT, type Category, type Lang, type Scene } from "@/config/shop";
import rawCatalog from "@data/catalog.json";

/** imageId format: "<icon>--<variant>", e.g. "sack--2". The icon selects the drawing, the variant the label colour. */
export const IMAGE_ID_PATTERN = /^[a-z]+--\d+$/;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const ProductSchema = z.object({
  id: z.string().regex(/^[a-z]{2}-\d{2}$/, "id must look like 'gr-01'"),
  category: z.enum(CATEGORIES),
  name_en: text(3, 40),
  name_ur: text(2, 40),
  unitLabel_en: text(1, 20),
  unitLabel_ur: text(1, 20),
  /** Integer, in PKR. Illustrative, not real prices. */
  price: z.number().int().positive(),
  rating: z
    .number()
    .min(1)
    .max(5)
    .refine((r) => Math.round(r * 10) === r * 10, "rating must have one decimal"),
  description_en: text(10, 90),
  description_ur: text(8, 90),
  imageId: z.string().regex(IMAGE_ID_PATTERN, "imageId must look like 'sack--1'"),
});
export type Product = z.infer<typeof ProductSchema>;

export const CatalogSchema = z
  .object({ products: z.array(ProductSchema).min(1) })
  .superRefine((cat, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const images = new Set<string>();
    cat.products.forEach((p, i) => {
      const key = `${p.name_en} ${p.unitLabel_en}`;
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", path: ["products", i, "id"], message: `duplicate id ${p.id}` });
      if (names.has(key)) ctx.addIssue({ code: "custom", path: ["products", i, "name_en"], message: `duplicate product ${key}` });
      if (images.has(p.imageId)) ctx.addIssue({ code: "custom", path: ["products", i, "imageId"], message: `duplicate imageId ${p.imageId}` });
      ids.add(p.id);
      names.add(key);
      images.add(p.imageId);
    });
  });
export type Catalog = z.infer<typeof CatalogSchema>;

export function parseCatalog(data: unknown): Catalog {
  const r = CatalogSchema.safeParse(data);
  if (!r.success) throw new Error(`Invalid catalogue:\n${z.prettifyError(r.error)}`);
  return r.data;
}

export const catalog: Catalog = parseCatalog(rawCatalog);
export const products: readonly Product[] = catalog.products;
export const productsById: ReadonlyMap<string, Product> = new Map(products.map((p) => [p.id, p]));

export const productName = (p: Product, lang: Lang) => (lang === "ur" ? p.name_ur : p.name_en);
export const productUnit = (p: Product, lang: Lang) => (lang === "ur" ? p.unitLabel_ur : p.unitLabel_en);
export const productDescription = (p: Product, lang: Lang) => (lang === "ur" ? p.description_ur : p.description_en);

/** Search matches the name in either language, so a participant can type in the script they prefer. */
export function matchesQuery(p: Product, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || p.name_en.toLowerCase().includes(q) || p.name_ur.includes(q);
}

export function imageUrl(p: Pick<Product, "imageId">): string {
  return `/products/${p.imageId}.svg`;
}

export function iconOf(imageId: string): string {
  return imageId.split("--")[0]!;
}

/** The fixed products of a clip scene: the first products of that category, in catalogue order. */
export function sceneProductIds(scene: Scene): string[] {
  return products.filter((p) => p.category === scene).slice(0, SCENE_PRODUCT_COUNT).map((p) => p.id);
}

export interface CatalogStats {
  total: number;
  perCategory: { category: Category; count: number; minPrice: number; maxPrice: number; meanPrice: number; meanRating: number }[];
}

export function catalogStats(cat: Catalog): CatalogStats {
  return {
    total: cat.products.length,
    perCategory: CATEGORIES.map((category) => {
      const ps = cat.products.filter((p) => p.category === category);
      const prices = ps.map((p) => p.price);
      return {
        category,
        count: ps.length,
        minPrice: ps.length ? Math.min(...prices) : 0,
        maxPrice: ps.length ? Math.max(...prices) : 0,
        meanPrice: ps.length ? prices.reduce((a, b) => a + b, 0) / ps.length : 0,
        meanRating: ps.length ? ps.reduce((a, p) => a + p.rating, 0) / ps.length : 0,
      };
    }),
  };
}

const URDU_SCRIPT = /[؀-ۿ]/;

/** Extra structural rules beyond the Zod schema. Returns human-readable problems (empty = OK). */
export function catalogProblems(cat: Catalog, opts: { minPerCategory?: number; brandWords?: string[] } = {}): string[] {
  const problems: string[] = [];
  for (const c of catalogStats(cat).perCategory) {
    if (c.count < (opts.minPerCategory ?? 10)) problems.push(`Category "${c.category}" has only ${c.count} products`);
    if (c.count < SCENE_PRODUCT_COUNT) problems.push(`Category "${c.category}" has fewer products than a clip scene shows`);
  }
  for (const p of cat.products) {
    for (const w of opts.brandWords ?? []) {
      if (p.name_en.toLowerCase().includes(w.toLowerCase())) problems.push(`Product ${p.id} name contains brand-like word "${w}"`);
    }
    for (const field of ["name_ur", "unitLabel_ur", "description_ur"] as const)
      if (!URDU_SCRIPT.test(p[field])) problems.push(`Product ${p.id}: ${field} is not written in Urdu script`);
    for (const field of ["name_en", "description_en"] as const)
      if (URDU_SCRIPT.test(p[field])) problems.push(`Product ${p.id}: ${field} contains Urdu script`);
  }
  return problems;
}
