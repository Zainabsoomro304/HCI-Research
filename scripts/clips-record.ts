/**
 * pnpm clips:record — records every comparison clip (target x scene x language) and every still.
 *
 * Deterministic frame stepping: the page clock never runs freely. Frames are captured one by one:
 *   frames   0-29  (0.0-1.0 s)  base config
 *   frames  30-41  (1.0-1.4 s)  transition, paused and seeked to (i-30)/30 s
 *   frames 42-119  (1.4-4.0 s)  target config at rest
 * = exactly 120 frames = 4.0 s at 30 fps, encoded as H.264 MP4 1280x800 with ffmpeg (-preset veryfast).
 *
 * Output (hashed names, so participants never see config IDs):
 *   public/m/<key>.mp4   one clip per target x scene x language (36 x 6 x 2 = 432)
 *   public/m/<key>.jpg   one still per config x language, in the still scene (432 x 2 = 864)
 *   data/media-manifest.json   what each key is, with sizes
 * Fails loudly if any clip is not exactly 120 frames / 4.0 s.
 *
 * Options: --only=<configId> --scene=<scene> --lang=en|ur --workers=<n> --skip-stills --stills-only --clips-only
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import rawClips from "@data/clips.json";
import { CLIP_SCENES, LANGUAGES, STILL_SCENE } from "@/config/shop";
import { ALL_CONFIG_IDS } from "@/config/uiSpace";
import { CLIP_SET, parseClipsFile } from "@/lib/clipsFile";
import { clipKey, stillKey } from "@/lib/media";
import { authorize, ensureServer } from "./lib/server";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const has = (flag: string) => process.argv.includes(`--${flag}`);

const { fps, width, height, durationMs, transitionStartMs, transitionEndMs } = CLIP_SET;
const TOTAL_FRAMES = Math.round((durationMs / 1000) * fps); // 120
const T_START = Math.round((transitionStartMs / 1000) * fps); // 30
const T_END = Math.round((transitionEndMs / 1000) * fps); // 42
const TOLERANCE_S = 0.05;
const STILL_QUALITY = 86;

const mediaDir = path.resolve("public/m");
const workRoot = path.resolve("tmp/clip-frames");
const manifestPath = path.resolve("data/media-manifest.json");

if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a binary for this platform");
const FFMPEG = ffmpegPath as unknown as string;
const clipsFile = parseClipsFile(rawClips);
const frameName = (i: number) => `frame_${String(i).padStart(3, "0")}.png`;

interface ClipJob {
  configId: string;
  scene: string;
  lang: string;
  practice: boolean;
}

async function loadClip(page: Page, base: string, job: { configId: string; scene: string; lang: string }, extra = "") {
  await page.goto(`${base}/clip?target=${job.configId}&scene=${job.scene}&lang=${job.lang}&seed=${clipsFile.seed}${extra}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__clip);
  await page.evaluate(() => window.__clip!.ready());
}

async function recordFrames(page: Page, base: string, job: ClipJob, dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await loadClip(page, base, job);
  const shot = (i: number) => page.screenshot({ path: path.join(dir, frameName(i)), animations: "allow", caret: "hide" });
  const copy = (from: number, to: number) => fs.copyFileSync(path.join(dir, frameName(from)), path.join(dir, frameName(to)));
  await shot(0);
  for (let i = 1; i < T_START; i++) copy(0, i);
  const animations = await page.evaluate(() => window.__clip!.start());
  if (animations === 0) throw new Error(`${job.configId}/${job.scene}/${job.lang}: no transition animations were created`);
  for (let i = T_START; i < T_END; i++) {
    await page.evaluate((t) => window.__clip!.seek(t), ((i - T_START) * 1000) / fps);
    await shot(i);
  }
  await page.evaluate(() => window.__clip!.finish());
  await shot(T_END);
  for (let i = T_END + 1; i < TOTAL_FRAMES; i++) copy(T_END, i);
  return animations;
}

function encode(dir: string, out: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, [
      "-y", "-loglevel", "error",
      "-framerate", String(fps),
      "-i", path.join(dir, "frame_%03d.png"),
      "-frames:v", String(TOTAL_FRAMES),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-r", String(fps), "-s", `${width}x${height}`, "-movflags", "+faststart",
      out,
    ]);
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed for ${out}:\n${err}`))));
  });
}

/** Decodes the file and returns frame count and container duration. */
export function probe(file: string): { frames: number; durationS: number } {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-map", "0:v:0", "-f", "null", "-"], { encoding: "utf8" });
  const text = r.stderr ?? "";
  const frames = Number([...text.matchAll(/frame=\s*(\d+)/g)].pop()?.[1] ?? NaN);
  const d = text.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationS = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : NaN;
  return { frames, durationS };
}

/** Runs jobs on `workers` browser pages at once. */
async function pool<T>(browser: Browser, url: string, jobs: T[], workers: number, run: (page: Page, job: T, n: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, jobs.length) }, async () => {
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      await authorize(context, url);
      const page = await context.newPage();
      while (next < jobs.length) {
        const n = next++;
        await run(page, jobs[n]!, n);
      }
      await context.close();
    }),
  );
}

function readManifest(): { clips: Record<string, unknown>; stills: Record<string, unknown> } {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { clips: {}, stills: {} };
  }
}

async function main() {
  const started = Date.now();
  const only = arg("only");
  const sceneFilter = arg("scene");
  const langFilter = arg("lang");
  const workers = Number(arg("workers") ?? 4);
  const targets = [
    ...clipsFile.clips.map((c) => ({ id: c.id, practice: false })),
    ...clipsFile.practiceClips.map((c) => ({ id: c.id, practice: true })),
  ].filter((c) => !only || c.id === only);
  if (only && targets.length === 0) throw new Error(`${only} is not in data/clips.json`);
  const scenes = CLIP_SCENES.filter((s) => !sceneFilter || s === sceneFilter);
  const langs = LANGUAGES.filter((l) => !langFilter || l === langFilter);
  const jobs: ClipJob[] = targets.flatMap((t) => scenes.flatMap((scene) => langs.map((lang) => ({ configId: t.id, scene, lang, practice: t.practice }))));

  const server = await ensureServer();
  const browser = await chromium.launch();
  fs.mkdirSync(mediaDir, { recursive: true });
  const manifest = readManifest();
  const failures: string[] = [];
  let clipBytes = 0;
  let stillBytes = 0;
  try {
    if (!has("stills-only")) {
      await pool(browser, server.url, jobs, workers, async (page, job, n) => {
        const key = clipKey(job.configId, job.scene, job.lang);
        const dir = path.join(workRoot, key);
        const animations = await recordFrames(page, server.url, job, dir);
        const mp4 = path.join(mediaDir, `${key}.mp4`);
        await encode(dir, mp4);
        fs.rmSync(dir, { recursive: true, force: true });
        const { frames, durationS } = probe(mp4);
        const ok = frames === TOTAL_FRAMES && Math.abs(durationS - 4) <= TOLERANCE_S && Math.abs(frames / fps - 4) <= TOLERANCE_S;
        if (!ok) failures.push(`${job.configId} ${job.scene} ${job.lang}: ${frames} frames, container duration ${durationS}s`);
        const bytes = fs.statSync(mp4).size;
        clipBytes += bytes;
        manifest.clips[key] = { configId: job.configId, scene: job.scene, lang: job.lang, practice: job.practice, frames, animations, bytes };
        console.log(`[clip ${n + 1}/${jobs.length}] ${job.configId} ${job.scene} ${job.lang}  ${ok ? "ok" : "FAIL"}  ${Math.round(bytes / 1024)} KB`);
      });
      fs.rmSync(workRoot, { recursive: true, force: true });
    }
    if (!has("skip-stills") && !has("clips-only") && !only && !sceneFilter) {
      const stillJobs = ALL_CONFIG_IDS.flatMap((configId) => langs.map((lang) => ({ configId, scene: STILL_SCENE, lang })));
      await pool(browser, server.url, stillJobs, workers, async (page, job, n) => {
        await loadClip(page, server.url, job, "&static=1");
        const key = stillKey(job.configId, job.lang);
        const file = path.join(mediaDir, `${key}.jpg`);
        await page.screenshot({ path: file, type: "jpeg", quality: STILL_QUALITY, caret: "hide" });
        const bytes = fs.statSync(file).size;
        stillBytes += bytes;
        manifest.stills[key] = { configId: job.configId, lang: job.lang, bytes };
        if ((n + 1) % 48 === 0) console.log(`[still ${n + 1}/${stillJobs.length}]`);
      });
    }
  } finally {
    await browser.close();
    server.stop();
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
  const all = [...Object.values(manifest.clips), ...Object.values(manifest.stills)] as { bytes: number }[];
  const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
  console.log(`\nThis run: ${jobs.length} clips (${mb(clipBytes)} MB), stills ${mb(stillBytes)} MB, in ${((Date.now() - started) / 60000).toFixed(1)} min.`);
  console.log(`All media in the manifest: ${Object.keys(manifest.clips).length} clips + ${Object.keys(manifest.stills).length} stills = ${mb(all.reduce((a, x) => a + x.bytes, 0))} MB.`);
  if (failures.length) {
    console.error(`\n${failures.length} CLIP(S) FAILED the 120-frame / 4.0 s check:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  if (!has("stills-only")) console.log(`All ${jobs.length} clips are exactly ${TOTAL_FRAMES} frames (4.000 s at ${fps} fps).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
