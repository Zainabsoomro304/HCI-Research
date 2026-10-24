/** pnpm catalog:check — validates data/catalog.json and prints counts and price ranges per category. */
import fs from "node:fs";
import path from "node:path";
import { CatalogSchema, catalogProblems, catalogStats, iconOf } from "@/lib/catalog";
import { hasIcon } from "@/lib/productArt";
import { formatPrice } from "@/config/shop";
import { BRAND_WORDS } from "@/config/brandWords";

const raw = JSON.parse(fs.readFileSync(path.resolve("data/catalog.json"), "utf8"));
const parsed = CatalogSchema.safeParse(raw);
if (!parsed.success) {
  console.error("Catalogue is INVALID:\n" + parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}
const cat = parsed.data;
const problems = catalogProblems(cat, { minPerCategory: 10, brandWords: BRAND_WORDS });
for (const p of cat.products) {
  if (!hasIcon(iconOf(p.imageId))) problems.push(`Product ${p.id}: no icon drawing for "${iconOf(p.imageId)}"`);
  if (!fs.existsSync(path.resolve("public/products", `${p.imageId}.svg`)))
    problems.push(`Product ${p.id}: missing public/products/${p.imageId}.svg (run pnpm catalog:images)`);
}

const stats = catalogStats(cat);
console.log(`Catalogue: ${stats.total} products\n`);
console.table(
  stats.perCategory.map((c) => ({
    category: c.category,
    products: c.count,
    "min price": formatPrice(c.minPrice),
    "max price": formatPrice(c.maxPrice),
    "mean price": formatPrice(Math.round(c.meanPrice)),
    "mean rating": c.meanRating.toFixed(2),
  })),
);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}
console.log("\nCatalogue OK.");
