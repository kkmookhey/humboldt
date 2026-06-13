import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { outDir } from "./config.mjs";

const PRE = 3.5; // seconds before a section's mark() that its page is already on screen

// Pure: build an ffmpeg filter_complex that blurs each region only during its
// [start,end] window. Each region: {x,y,w,h,start,end}. Returns {filter, out}.
export function buildRedactFilter(regions) {
  const n = regions.length;
  // [0:v] can only be consumed once, so split it into one base + one copy per region.
  const split = `[0:v]split=${n + 1}[base]${regions.map((_, i) => `[k${i}]`).join("")}`;
  const crops = regions.map((r, i) => {
    // chroma plane caps the blur radius (~min(w,h)/2); stay well under it, 2 passes for strength.
    const rad = Math.max(2, Math.min(12, Math.floor(Math.min(r.w, r.h) / 4)));
    return `[k${i}]crop=${r.w}:${r.h}:${r.x}:${r.y},boxblur=${rad}:2[c${i}]`;
  });
  let prev = "base";
  const overlays = regions.map((r, i) => {
    const out = i === n - 1 ? "vout" : `v${i}`;
    const step = `[${prev}][c${i}]overlay=${r.x}:${r.y}:enable='between(t,${r.start},${r.end})'[${out}]`;
    prev = out;
    return step;
  });
  return { filter: [split, ...crops, ...overlays].join(";"), out: "vout" };
}

// Resolve each module redaction (tied to a section id) to concrete time windows
// using the recorded timing offsets, then blur those regions.
export function redactModule(m) {
  if (!m.redactions || !m.redactions.length) throw new Error(`module '${m.id}' has no redactions`);
  const dir = outDir(m.id);
  const src = path.join(dir, `${m.id}-narrated.mp4`);
  if (!fs.existsSync(src)) throw new Error(`missing ${src} — build the module first`);
  const timing = JSON.parse(fs.readFileSync(path.join(dir, "timing.json"), "utf8"));
  const offsets = timing.offsets;
  const sorted = Object.values(offsets).sort((a, b) => a - b);
  const dur = parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src])
      .toString().trim(),
  );

  const regions = [];
  for (const red of m.redactions) {
    // section "*" blurs across the WHOLE video — e.g. the top-right account/user
    // menu that AWS shows on every console page.
    let start, end;
    if (red.section === "*") {
      start = 0;
      end = dur;
    } else {
      start = offsets[red.section];
      if (start == null) throw new Error(`redaction references unknown section '${red.section}'`);
      const next = sorted.find((o) => o > start);
      end = next ?? dur;
      start = Math.max(0, start - PRE);
    }
    for (const r of red.regions) {
      // yuv420p needs even dimensions/offsets; snap to even so authors don't have to.
      const even = (v, up) => (up ? Math.ceil(v / 2) * 2 : Math.floor(v / 2) * 2);
      regions.push({
        x: even(r.x), y: even(r.y), w: even(r.w, true), h: even(r.h, true),
        start, end,
      });
    }
  }

  const { filter, out } = buildRedactFilter(regions);
  const final = path.join(dir, `${m.id}-narrated-redacted.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-i", src, "-filter_complex", filter,
    "-map", `[${out}]`, "-map", "0:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy", final,
  ], { stdio: "inherit" });
  console.log(`✅ Redacted video → ${final} (${regions.length} blurred regions)`);
  return final;
}
