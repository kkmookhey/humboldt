// Record an HTML-deck module: drive a local deck.html slide-by-slide in headless
// Chromium, capture one 1920x1080 still per narration segment, and assemble a
// narration-paced slideshow — producing the same silent.mp4 + timing.json that
// bin/mux.mjs and bin/brand.mjs already consume. No console, no auth.
//
//   node bin/gen-audio.mjs <id>     # first — renders narration + durations
//   node bin/record-deck.mjs <id>   # this — deck stills -> silent.mp4 + timing.json
//   node bin/mux.mjs <id> && node bin/brand.mjs <id>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { loadModule } from "../lib/module.mjs";
import { segmentsOf } from "../lib/schema.mjs";
import { outDir } from "../lib/config.mjs";

const PAD = 1.0;
const m = loadModule(process.argv[2]);
if (!m.deck) throw new Error(`module '${m.id}' has no "deck" URL — set it to the deck.html file:// URL`);

const dir = outDir(m.id);
const manifestPath = path.join(dir, "audio", "manifest.json");
if (!fs.existsSync(manifestPath)) throw new Error(`Run gen-audio first: node bin/gen-audio.mjs ${m.id}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const dur = Object.fromEntries(manifest.map((x) => [x.id, x.durationSec]));
const segDur = (id) => (dur[id] ?? 8) + PAD;

const sdir = path.join(dir, "stills");
fs.rmSync(sdir, { recursive: true, force: true });
fs.mkdirSync(sdir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const segs = []; // { id, file, dur }
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(m.deck, { waitUntil: "load" });
  await page.waitForTimeout(500);

  let n = 0;
  for (const seg of segmentsOf(m)) {
    const ok = await page.evaluate((id) => typeof window.showSlide === "function" && (window.showSlide(id), document.querySelector('.slide[data-id="' + id + '"].active') != null), seg.id);
    if (!ok) console.warn(`⚠️  no deck slide for segment '${seg.id}' — capturing whatever is shown`);
    await page.waitForTimeout(450); // let the slide paint
    const file = path.join(sdir, `${String(n++).padStart(3, "0")}-${seg.id}.png`);
    await page.screenshot({ path: file }); // full 1920x1080 viewport
    segs.push({ id: seg.id, file, dur: segDur(seg.id) });
    console.log(`>> ${seg.id.padEnd(16)} ${segDur(seg.id).toFixed(1)}s`);
  }
} finally {
  await browser.close().catch(() => {});
}

if (segs.length < 2) throw new Error("no slides captured");

// Per-segment exact-length clips, then concat (same approach as recorder-cdp).
const offsets = {};
let t = 0;
const clips = [];
for (const seg of segs) {
  offsets[seg.id] = +t.toFixed(3);
  const clip = path.join(sdir, `clip-${String(clips.length).padStart(3, "0")}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loop", "1", "-t", seg.dur.toFixed(3), "-i", seg.file,
    "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=25,format=yuv420p",
    "-r", "25", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip,
  ], { stdio: "ignore" });
  clips.push(clip);
  t += seg.dur;
}
fs.writeFileSync(path.join(sdir, "clips.txt"), clips.map((c) => `file '${path.basename(c)}'`).join("\n"));
const silent = path.join(dir, "silent.mp4");
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", "clips.txt", "-c", "copy", silent], { cwd: sdir, stdio: "inherit" });
fs.writeFileSync(path.join(dir, "timing.json"), JSON.stringify({ offsets }, null, 2));
fs.rmSync(sdir, { recursive: true, force: true });
console.log("✅ Silent deck video →", silent);
