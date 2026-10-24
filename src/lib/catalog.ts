import { z } from "zod";
import { CATEGORIES } from "@/config/shop";
import rawCatalog from "@data/catalog.json";

/** imageId format: "<icon>--<variant>", e.g. "lamp--2". The icon selects the SVG drawing. */
export const IMAGE_ID_PATTERN = /^[a-z]+--\d+$/;

export const ProductSchema = z.object({
  id: z.string().regex(/^[a-z]{2}-\d{2}$/, "id must look like 'ho-01'"),
  name: z.string().min(3).max(60),
  category: z.enum(CATEGORIES),
  price: z.number().int().positive(),
  rating: z
    .number()
    .min(1)
    .max(5)
    .refine((r) => Math.round(r * 10) === r * 10, "rating must have one decimal"),
  description: z.string().min(10).max(120),
  imageId: z.string().regex(IMAGE_ID_PATTERN, "imageId must look like 'lamp--1'"),
});
export type Product = z.infer<typeof ProductSchema>;

export const CatalogSchema = z
  .object({ products: z.array(ProductSchema).min(1) })
  .superRefine((cat, ctx) => {
    const ids = new Set<string>();
    const names = new Set<string>();
    const images = new Set<string>();
    cat.products.forEach((p, i) => {
      if (ids.has(p.id)) ctx.addIssue({ code: "custom", path: ["products", i, "id"], message: `duplicate id ${p.id}` });
      if (names.has(p.name)) ctx.addIssue({ code: "custom", path: ["products", i, "name"], message: `duplicate name ${p.name}` });
      if (images.has(p.imageId)) ctx.addIssue({ code: "custom", path: ["products", i, "imageId"], message: `duplicate imageId ${p.imageId}` });
      ids.add(p.id);
      names.add(p.name);
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

export function imageUrl(p: Pick<Product, "imageId">): string {
  return `/products/${p.imageId}.svg`;
}

export function iconOf(imageId: string): string {
  return imageId.split("--")[0]!;
}

export interface CatalogStats {
  total: number;
  perCategory: { category: string; count: number; minPrice: number; maxPrice: number; meanPrice: number; meanRating: number }[];
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

/** Extra structural rules beyond the Zod schema. Returns human-readable problems (empty = OK). */
export function catalogProblems(cat: Catalog, opts: { minPerCategory?: number; brandWords?: string[] } = {}): string[] {
  const problems: string[] = [];
  const stats = catalogStats(cat);
  for (const c of stats.perCategory) {
    if (c.count < (opts.minPerCategory ?? 10)) problems.push(`Category "${c.category}" has only ${c.count} products`);
  }
  for (const p of cat.products) {
    for (const w of opts.brandWords ?? []) {
      if (p.name.toLowerCase().includes(w.toLowerCase())) problems.push(`Product ${p.id} name contains brand-like word "${w}"`);
    }
  }
  return problems;
}
