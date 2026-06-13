import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { ROOT, VIEWPORT, THEME, outDir } from "./config.mjs";

export const assetsDir = () => path.join(ROOT, "assets");

// Render brand text as a 1920x1080 TRANSPARENT png so it can overlay any
// background — gradient now, a Higgsfield clip later, with no recompositing.
async function renderTextPng(spec, outPath) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto("about:blank");
    await page.evaluate(({ d, mono }) => {
      Object.assign(document.body.style, {
        margin: "0", width: "1920px", height: "1080px", background: "transparent",
        display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
        fontFamily: mono, color: "#e6edf3",
      });
      // Soft dark scrim behind the text — keeps the smaller URL/tagline lines
      // legible over a bright background clip (e.g. a Higgsfield vanishing point).
      const scrim = document.createElement("div");
      Object.assign(scrim.style, {
        position: "absolute", inset: "0",
        background: "radial-gradient(1000px 560px at 50% 50%, rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.44) 55%, rgba(0,0,0,0) 80%)",
      });
      document.body.appendChild(scrim);
      const shadow = "0 4px 34px rgba(0,0,0,0.85)";
      const brand = document.createElement("div"); brand.textContent = d.brand;
      Object.assign(brand.style, { fontSize: "96px", fontWeight: "800", letterSpacing: "6px", color: "#fff", textShadow: shadow, textAlign: "center" });
      const url = document.createElement("div"); url.textContent = d.url;
      Object.assign(url.style, { fontSize: "34px", fontWeight: "600", letterSpacing: "3px", marginTop: "20px", color: "#8fc4ff", textShadow: shadow });
      document.body.appendChild(brand); document.body.appendChild(url);
      if (d.tagline) {
        const t = document.createElement("div"); t.textContent = d.tagline.toUpperCase();
        Object.assign(t.style, { fontSize: "24px", letterSpacing: "6px", marginTop: "40px", color: "#9aa7b6", textShadow: shadow });
        document.body.appendChild(t);
      }
    }, { d: spec, mono: THEME.mono });
    await page.screenshot({ path: outPath, omitBackground: true });
  } finally {
    await browser.close();
  }
}

// On-brand radial-gradient background still (Phase-1 motion source).
async function renderBgPng(outPath) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto("about:blank");
    await page.evaluate(() => {
      Object.assign(document.body.style, {
        margin: "0", width: "1920px", height: "1080px",
        background: "radial-gradient(1200px 760px at 50% 42%, #101a2b 0%, #06080d 72%)",
      });
    });
    await page.screenshot({ path: outPath });
  } finally {
    await browser.close();
  }
}

// Compose a sting: motion background + overlaid text + fades + silent track.
// `bg` may be an image (slow Ken-Burns zoom) or a video (scaled/looped) — the
// latter is how a Higgsfield clip slots in.
export function buildSting({ bg, textPng, out, seconds = 4 }) {
  const isImage = /\.(png|jpe?g)$/i.test(bg);
  const bgInput = isImage
    ? ["-loop", "1", "-t", String(seconds), "-i", bg]
    : ["-stream_loop", "-1", "-t", String(seconds), "-i", bg];
  // Image background is held static (Phase-1 placeholder); a video background
  // (e.g. a Higgsfield clip) brings its own motion.
  const bgChain = isImage
    ? `scale=1920:1080,fps=25`
    : `scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=25`;
  const fadeOut = Math.max(0, seconds - 0.6).toFixed(2);
  const filter = [
    `[0:v]${bgChain},setsar=1,format=yuv420p[bg]`,
    `[1:v]scale=1920:1080[txt]`,
    `[bg][txt]overlay=0:0[ov]`,
    `[ov]fade=t=in:st=0:d=0.6,fade=t=out:st=${fadeOut}:d=0.6[v]`,
  ].join(";");
  execFileSync("ffmpeg", [
    "-y", ...bgInput, "-i", textPng,
    "-f", "lavfi", "-t", String(seconds), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-filter_complex", filter, "-map", "[v]", "-map", "2:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "25", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", out,
  ], { stdio: "inherit" });
  return out;
}

// One-time: build assets/intro.mp4 + assets/outro.mp4. `bgVideo` (optional) is a
// Higgsfield clip; without it, the on-brand gradient is used.
export async function makeStings({ bgVideo } = {}) {
  const dir = assetsDir();
  fs.mkdirSync(dir, { recursive: true });
  const brand = "NETWORK INTELLIGENCE";
  const url = "Visit us at www.networkintelligence.ai";
  await renderTextPng({ brand, url, tagline: "AWS Security Course" }, path.join(dir, "text-intro.png"));
  await renderTextPng({ brand, url, tagline: "Thanks for watching" }, path.join(dir, "text-outro.png"));
  let bg = path.join(dir, "bg.png");
  if (bgVideo) bg = bgVideo;
  else await renderBgPng(bg);
  buildSting({ bg, textPng: path.join(dir, "text-intro.png"), out: path.join(dir, "intro.mp4") });
  buildSting({ bg, textPng: path.join(dir, "text-outro.png"), out: path.join(dir, "outro.mp4") });
  return { intro: path.join(dir, "intro.mp4"), outro: path.join(dir, "outro.mp4") };
}

// Pure: normalize each input to a common format, then concat. Exposed for tests.
export function buildConcatFilter(n) {
  const norm = Array.from({ length: n }, (_, i) =>
    `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,format=yuv420p[v${i}];` +
    `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[a${i}]`,
  ).join(";");
  const cat = Array.from({ length: n }, (_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${n}:v=1:a=1[v][a]`;
  return `${norm};${cat}`;
}

// Wrap a built module: intro + (redacted, else plain) module video + outro.
export function brandModule(m) {
  const dir = outDir(m.id);
  const body = [
    path.join(dir, `${m.id}-narrated-redacted.mp4`),
    path.join(dir, `${m.id}-narrated.mp4`),
  ].find((p) => fs.existsSync(p));
  if (!body) throw new Error(`no built video for '${m.id}' — build it first`);
  const intro = path.join(assetsDir(), "intro.mp4");
  const outro = path.join(assetsDir(), "outro.mp4");
  for (const s of [intro, outro])
    if (!fs.existsSync(s)) throw new Error(`missing ${s} — run: node bin/make-sting.mjs`);

  const parts = [intro, body, outro];
  const inputs = parts.flatMap((p) => ["-i", p]);
  const final = path.join(dir, `${m.id}-final.mp4`);
  execFileSync("ffmpeg", [
    "-y", ...inputs, "-filter_complex", buildConcatFilter(parts.length),
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", final,
  ], { stdio: "inherit" });
  console.log(`✅ Branded video → ${final}`);
  return final;
}
