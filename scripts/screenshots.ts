/**
 * pnpm screenshots — renders the shop for visual review (equal polish, clipping, overlaps, RTL and Nastaliq problems).
 *
 *   screenshots/<lang>/1280x800/<configId>.png   every configuration, both languages (432 x 2)
 *   screenshots/<lang>/1024x768/<configId>.png   a fixed sample of 40 configurations (20 per language)
 *   screenshots/index.html                       contact sheet, filterable by setting, level, language and size
 *   screenshots/layout-check.json                automatic check of every render: horizontal page overflow, text cut off
 *                                                by its box, and controls overlapping each other; the script exits 1 on any
 *
 * Options: --only=<substring of config ID> --lang=en|ur --category=<id> --workers=<n> --no-tablet
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { LANGUAGES, STILL_SCENE } from "@/config/shop";
import { ALL_CONFIG_IDS, SETTING_KEYS, SETTING_LEVELS } from "@/config/uiSpace";
import { createRng } from "@/lib/random";
import { authorize, ensureServer } from "./lib/server";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const only = arg("only");
const category = arg("category") ?? STILL_SCENE;
const langs = LANGUAGES.filter((l) => !arg("lang") || l === arg("lang"));
const workers = Number(arg("workers") ?? 4);
const ids = ALL_CONFIG_IDS.filter((id) => !only || id.includes(only));
const tabletSample = createRng(20261110).shuffle([...ALL_CONFIG_IDS]).slice(0, 40);

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

/** Layout problems that can be detected from the DOM. Returns human-readable messages; empty = fine. */
export async function layoutProblems(page: Page): Promise<string[]> {
  // tsx keeps function names with a __name() helper that does not exist in the page.
  await page.evaluate("window.__name = window.__name || ((f) => f)");
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) problems.push(`page scrolls sideways (${doc.scrollWidth}px > ${window.innerWidth}px)`);
    const shop = document.querySelector(".shop");
    if (!shop) return ["no .shop element"];
    const label = (el: Element) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    // Text cut off: an element that hides overflow and whose content is larger than its box (ignoring 1px rounding).
    for (const el of shop.querySelectorAll<HTMLElement>("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const hides = ["hidden", "clip"].includes(cs.overflowX) || ["hidden", "clip"].includes(cs.overflowY);
      if (!hides || !el.textContent?.trim()) continue;
      if (el.closest(".sr-only") || el.clientWidth <= 1) continue; // visually hidden on purpose (screen-reader text)
      if (cs.textOverflow === "ellipsis" || cs.webkitLineClamp !== "none") continue; // deliberate truncation with "..."
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) problems.push(`text cut off: ${label(el)} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
    }
    // Controls overlapping: visible buttons, links and inputs whose boxes intersect.
    const controls = [...shop.querySelectorAll<HTMLElement>("button, a, input")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== "hidden";
    });
    for (let i = 0; i < controls.length; i++)
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i]!, b = controls[j]!;
        if (a.contains(b) || b.contains(a)) continue;
        const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        const w = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        const h = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (w > 2 && h > 2) problems.push(`controls overlap: ${label(a)} and ${label(b)}`);
      }
    return problems;
  });
}

interface Job {
  id: string;
  lang: string;
  width: number;
  height: number;
}

async function main() {
  const jobs: Job[] = [
    ...langs.flatMap((lang) => ids.map((id) => ({ id, lang, width: 1280, height: 800 }))),
    ...(process.argv.includes("--no-tablet") ? [] : tabletSample.filter((id) => !only || id.includes(only)).map((id, i) => ({ id, lang: langs[i % langs.length]!, width: 1024, height: 768 }))),
  ];
  const server = await ensureServer();
  const browser = await chromium.launch();
  const outRoot = path.resolve("screenshots");
  let next = 0;
  let done = 0;
  const report: Record<string, string[]> = {};
  try {
    await Promise.all(
      Array.from({ length: workers }, async () => {
        const pages = new Map<string, Page>();
        while (next < jobs.length) {
          const job = jobs[next++]!;
          const size = `${job.width}x${job.height}`;
          let page = pages.get(size);
          if (!page) {
            const context = await browser.newContext({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
            await authorize(context, server.url);
            page = await context.newPage();
            pages.set(size, page);
          }
          const dir = path.join(outRoot, job.lang, size);
          fs.mkdirSync(dir, { recursive: true });
          await page.goto(`${server.url}/preview?static=1&config=${job.id}&lang=${job.lang}&category=${encodeURIComponent(category)}`, { waitUntil: "networkidle" });
          await waitForStableRender(page);
          const problems = await layoutProblems(page);
          if (problems.length) report[`${job.lang}/${size}/${job.id}`] = problems;
          await page.screenshot({ path: path.join(dir, `${job.id}.png`) });
          if (++done % 50 === 0) console.log(`  ${done}/${jobs.length}`);
        }
        for (const p of pages.values()) await p.close();
      }),
    );
    console.log(`${done} screenshots -> ${path.relative(process.cwd(), outRoot)}`);
    writeGallery(outRoot);
    fs.writeFileSync(path.join(outRoot, "layout-check.json"), JSON.stringify(report, null, 1) + "\n");
    const bad = Object.keys(report).length;
    console.log(bad ? `LAYOUT CHECK: ${bad} of ${done} renders have problems (screenshots/layout-check.json).` : `Layout check: all ${done} renders pass (no sideways scrolling, no text cut off, no overlapping controls).`);
    if (bad) process.exitCode = 1;
  } finally {
    await browser.close();
    server.stop();
  }
}

function writeGallery(outRoot: string) {
  const items: { lang: string; size: string; id: string }[] = [];
  for (const lang of fs.readdirSync(outRoot).filter((d) => fs.statSync(path.join(outRoot, d)).isDirectory()))
    for (const size of fs.readdirSync(path.join(outRoot, lang)))
      for (const f of fs.readdirSync(path.join(outRoot, lang, size)).filter((x) => x.endsWith(".png"))) items.push({ lang, size, id: f.replace(".png", "") });
  const selects = SETTING_KEYS.map(
    (k, i) => `<label>${k} <select data-i="${i}"><option value="">any</option>${SETTING_LEVELS[k].map((l) => `<option>${l}</option>`).join("")}</select></label>`,
  ).join("");
  const cards = items
    .map((it) => `<figure data-lang="${it.lang}" data-size="${it.size}" data-id="${it.id}"><a href="${it.lang}/${it.size}/${it.id}.png"><img loading="lazy" src="${it.lang}/${it.size}/${it.id}.png"></a><figcaption>${it.lang} · ${it.size}<br>${it.id}</figcaption></figure>`)
    .join("");
  fs.writeFileSync(
    path.join(outRoot, "index.html"),
    `<!doctype html><meta charset="utf-8"><title>Shop variants</title>
<style>body{font:13px system-ui;margin:16px;background:#eee}#f{position:sticky;top:0;background:#fff;padding:10px;display:flex;flex-wrap:wrap;gap:10px;z-index:1;border-radius:6px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:12px;margin-top:12px}figure{margin:0;background:#fff;padding:6px;border-radius:6px}img{width:100%;display:block}figcaption{padding-top:4px;font-family:monospace;font-size:11px}</style>
<div id="f"><label>language <select id="lang"><option value="">any</option>${LANGUAGES.map((l) => `<option>${l}</option>`).join("")}</select></label>
<label>size <select id="size"><option value="">any</option><option>1280x800</option><option>1024x768</option></select></label>${selects}<span id="n"></span></div>
<div class="g">${cards}</div>
<script>
const f=[...document.querySelectorAll("figure")],sel=[...document.querySelectorAll("select")];
function apply(){const lang=document.getElementById("lang").value,size=document.getElementById("size").value;
const lv=sel.filter(s=>s.dataset.i).map(s=>[+s.dataset.i,s.value]);let n=0;
for(const x of f){const p=x.dataset.id.split("-");const ok=(!lang||x.dataset.lang===lang)&&(!size||x.dataset.size===size)&&lv.every(([i,v])=>!v||p[i]===v);x.style.display=ok?"":"none";if(ok)n++;}
document.getElementById("n").textContent=n+" shown";}
sel.forEach(s=>s.addEventListener("change",apply));apply();
</script>`,
  );
  console.log(`Contact sheet: ${path.relative(process.cwd(), path.join(outRoot, "index.html"))} (${items.length} images)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
