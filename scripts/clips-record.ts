/**
 * pnpm clips:record — records every clip in data/clips.json (analysis + practice) and the stills.
 *
 * Deterministic frame stepping: the page clock never runs freely. Frames are captured one by one:
 *   frames   0-29  (0.0-1.0 s)  base config
 *   frames  30-41  (1.0-1.4 s)  transition, paused and seeked to (i-30)/30 s
 *   frames 42-119  (1.4-4.0 s)  target config at rest
 * = exactly 120 frames = 4.0 s at 30 fps, encoded as H.264 MP4 1280x800 with ffmpeg (-preset veryfast).
 *
 * Output: public/clips/<configId>.mp4 and .png (final frame); public/stills/<configId>.png for all 108 configs.
 * Fails loudly if any clip's duration is not 4.0 s +/- 0.05 s.
 *
 * Options: --only=<configId>  --skip-stills  --stills-only
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import ffmpegPath from "ffmpeg-static";
import rawClips from "@data/clips.json";
import { ALL_CONFIG_IDS } from "@/config/uiSpace";
import { CLIP_SET, parseClipsFile } from "@/lib/clipsFile";
import { ensureServer } from "./lib/server";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const has = (flag: string) => process.argv.includes(`--${flag}`);

const { fps, width, height, durationMs, transitionStartMs, transitionEndMs } = CLIP_SET;
const TOTAL_FRAMES = Math.round((durationMs / 1000) * fps); // 120
const T_START = Math.round((transitionStartMs / 1000) * fps); // 30
const T_END = Math.round((transitionEndMs / 1000) * fps); // 42
const TOLERANCE_S = 0.05;

const clipsDir = path.resolve("public/clips");
const stillsDir = path.resolve("public/stills");
const workDir = path.resolve("tmp/clip-frames");

if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a binary for this platform");
const FFMPEG = ffmpegPath as unknown as string;

const frameName = (i: number) => `frame_${String(i).padStart(3, "0")}.png`;

async function loadClip(page: Page, base: string, id: string, extra = "") {
  await page.goto(`${base}/clip?target=${id}&seed=${clipsFile.seed}${extra}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__clip);
  await page.evaluate(() => window.__clip!.ready());
}

async function recordFrames(page: Page, base: string, id: string, dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await loadClip(page, base, id);
  const shot = (i: number) => page.screenshot({ path: path.join(dir, frameName(i)), animations: "allow", caret: "hide" });
  const copy = (from: number, to: number) => fs.copyFileSync(path.join(dir, frameName(from)), path.join(dir, frameName(to)));

  await shot(0);
  for (let i = 1; i < T_START; i++) copy(0, i);
  const animations = await page.evaluate(() => window.__clip!.start());
  if (animations === 0) throw new Error(`${id}: no transition animations were created`);
  for (let i = T_START; i < T_END; i++) {
    const ms = ((i - T_START) * 1000) / fps;
    await page.evaluate((t) => window.__clip!.seek(t), ms);
    await shot(i);
  }
  await page.evaluate(() => window.__clip!.finish());
  await shot(T_END);
  for (let i = T_END + 1; i < TOTAL_FRAMES; i++) copy(T_END, i);
  return animations;
}

function encode(dir: string, out: string) {
  const r = spawnSync(
    FFMPEG,
    [
      "-y", "-loglevel", "error",
      "-framerate", String(fps),
      "-i", path.join(dir, "frame_%03d.png"),
      "-frames:v", String(TOTAL_FRAMES),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
      "-r", String(fps), "-s", `${width}x${height}`, "-movflags", "+faststart",
      out,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${out}:\n${r.stderr}`);
}

/** Decodes the file and returns frame count and container duration. */
function probe(file: string): { frames: number; durationS: number } {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-map", "0:v:0", "-f", "null", "-"], { encoding: "utf8" });
  const text = r.stderr ?? "";
  const frames = Number([...text.matchAll(/frame=\s*(\d+)/g)].pop()?.[1] ?? NaN);
  const d = text.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationS = d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : NaN;
  return { frames, durationS };
}

const clipsFile = parseClipsFile(rawClips);

async function main() {
  const only = arg("only");
  const entries = [
    ...clipsFile.clips.map((c) => ({ ...c, practice: false })),
    ...clipsFile.practiceClips.map((c) => ({ ...c, practice: true })),
  ].filter((c) => !only || c.id === only);
  if (only && entries.length === 0) throw new Error(`${only} is not in data/clips.json`);

  const server = await ensureServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  fs.mkdirSync(clipsDir, { recursive: true });
  fs.mkdirSync(stillsDir, { recursive: true });

  const rows: Record<string, string | number>[] = [];
  const failures: string[] = [];
  try {
    if (!has("stills-only")) {
      for (const [n, c] of entries.entries()) {
        const dir = path.join(workDir, c.id);
        const animations = await recordFrames(page, server.url, c.id, dir);
        const mp4 = path.join(clipsDir, `${c.id}.mp4`);
        encode(dir, mp4);
        fs.copyFileSync(path.join(dir, frameName(TOTAL_FRAMES - 1)), path.join(clipsDir, `${c.id}.png`));
        const { frames, durationS } = probe(mp4);
        const fromFrames = frames / fps;
        const ok = frames === TOTAL_FRAMES && Math.abs(durationS - 4) <= TOLERANCE_S && Math.abs(fromFrames - 4) <= TOLERANCE_S;
        if (!ok) failures.push(`${c.id}: ${frames} frames, container duration ${durationS}s`);
        rows.push({
          clip: c.id,
          practice: c.practice ? "yes" : "",
          changed: c.numChangedSettings,
          animations,
          frames,
          "duration (s)": durationS.toFixed(3),
          "size (KB)": Math.round(fs.statSync(mp4).size / 1024),
          status: ok ? "ok" : "FAIL",
        });
        console.log(`[${n + 1}/${entries.length}] ${c.id}  ${ok ? "ok" : "FAIL"}`);
      }
      fs.rmSync(workDir, { recursive: true, force: true });
    }

    if (!has("skip-stills") && !only) {
      for (const id of ALL_CONFIG_IDS) {
        await loadClip(page, server.url, id, "&static=1");
        await page.screenshot({ path: path.join(stillsDir, `${id}.png`), caret: "hide" });
      }
      console.log(`Stills: ${ALL_CONFIG_IDS.length} -> ${path.relative(process.cwd(), stillsDir)}`);
    }
  } finally {
    await browser.close();
    server.stop();
  }

  if (rows.length) {
    console.log();
    console.table(rows);
  }
  if (failures.length) {
    console.error(`\n${failures.length} CLIP(S) FAILED the 4.0 s +/- ${TOLERANCE_S} s check:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  if (rows.length) console.log(`\nAll ${rows.length} clips are exactly ${TOTAL_FRAMES} frames (4.000 s at ${fps} fps).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
