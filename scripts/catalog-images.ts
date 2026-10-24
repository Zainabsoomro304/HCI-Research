/** Writes one SVG illustration per catalogue product to public/products/<imageId>.svg. */
import fs from "node:fs";
import path from "node:path";
import { products } from "@/lib/catalog";
import { renderProductSvg } from "@/lib/productArt";

const outDir = path.resolve("public/products");
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith(".svg")) fs.rmSync(path.join(outDir, f));

for (const p of products) {
  fs.writeFileSync(path.join(outDir, `${p.imageId}.svg`), renderProductSvg(p.imageId, p.category));
}
console.log(`Wrote ${products.length} SVGs to ${path.relative(process.cwd(), outDir)}/`);
