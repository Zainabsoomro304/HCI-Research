/**
 * pnpm screenshots — renders every configuration of the shop for visual inspection.
 *
 *   screenshots/1280x800/<configId>.png
 *   screenshots/1920x1080/<configId>.png
 *   screenshots/index.html            (gallery, open in a browser)
 *
 * Options: --viewport=1280x800 (only that size), --only=<substring of config ID>, --category="Home & Office"
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { ALL_CONFIG_IDS } from "@/config/uiSpace";
import { CLIP_CATEGORY } from "@/config/shop";
import { ensureServer } from "./lib/server";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
].filter((v) => !arg("viewport") || arg("viewport") === `${v.width}x${v.height}`);
const only = arg("only");
const category = arg("category") ?? CLIP_CATEGORY;
const ids = ALL_CONFIG_IDS.filter((id) => !only || id.includes(only));

export async function waitForStableRender(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? null
          : new Promise((r) => {
              img.addEventListener("load", r, { once: true });
              img.addEventListener("error", r, { once: true });
            }),
      ),
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

async function main() {
  const server = await ensureServer();
  const browser = await chromium.launch();
  const outRoot = path.resolve("screenshots");
  try {
    for (const vp of VIEWPORTS) {
      const dir = path.join(outRoot, `${vp.width}x${vp.height}`);
      fs.mkdirSync(dir, { recursive: true });
      const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
      let n = 0;
      for (const id of ids) {
        const url = `${server.url}/preview?static=1&config=${id}&category=${encodeURIComponent(category)}`;
        await page.goto(url, { waitUntil: "networkidle" });
        await waitForStableRender(page);
        await page.screenshot({ path: path.join(dir, `${id}.png`) });
        n++;
        if (n % 12 === 0) console.log(`  ${vp.width}x${vp.height}: ${n}/${ids.length}`);
      }
      await page.close();
      console.log(`${vp.width}x${vp.height}: ${n} screenshots -> ${path.relative(process.cwd(), dir)}`);
    }
    writeGallery(outRoot);
  } finally {
    await browser.close();
    server.stop();
  }
}

function writeGallery(outRoot: string) {
  const sizes = fs.readdirSync(outRoot).filter((d) => fs.statSync(path.join(outRoot, d)).isDirectory());
  const sections = sizes
    .map((size) => {
      const files = fs.readdirSync(path.join(outRoot, size)).filter((f) => f.endsWith(".png")).sort();
      const cards = files
        .map((f) => `<figure><a href="${size}/${f}"><img loading="lazy" src="${size}/${f}"></a><figcaption>${f.replace(".png", "")}</figcaption></figure>`)
        .join("");
      return `<h2>${size} (${files.length})</h2><div class="g">${cards}</div>`;
    })
    .join("");
  fs.writeFileSync(
    path.join(outRoot, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Shop variants</title><style>body{font:13px system-ui;margin:20px;background:#eee}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px}figure{margin:0;background:#fff;padding:6px;border-radius:6px}img{width:100%;display:block}figcaption{padding-top:4px;font-family:monospace}</style>${sections}`,
  );
  console.log(`Gallery: ${path.relative(process.cwd(), path.join(outRoot, "index.html"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
