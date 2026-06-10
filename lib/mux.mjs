import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { outDir } from "./config.mjs";

export function buildMixFilter(clips) {
  const delays = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.offset * 1000)}:all=1[a${i}]`).join(";");
  const mix = clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:normalize=0:dropout_transition=0[aout]`;
  return `${delays};${mix}`;
}

export function muxModule(m) {
  const dir = outDir(m.id);
  const silent = path.join(dir, "silent.mp4");
  if (!fs.existsSync(silent)) throw new Error(`missing ${silent} — run record first`);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "audio", "manifest.json"), "utf8"));
  const timing = JSON.parse(fs.readFileSync(path.join(dir, "timing.json"), "utf8"));
  if (!timing.offsets) throw new Error(`${path.join(dir, "timing.json")} has no offsets — re-run record`);

  const clips = manifest
    .filter((x) => timing.offsets[x.id] != null)
    .map((x) => ({ ...x, offset: timing.offsets[x.id] }))
    .sort((a, b) => a.offset - b.offset);
  if (!clips.length) throw new Error("no clips have timing offsets");

  const inputs = ["-i", silent];
  clips.forEach((c) => inputs.push("-i", path.join(dir, c.wav)));
  const final = path.join(dir, `${m.id}-narrated.mp4`);
  execFileSync("ffmpeg", [
    "-y", ...inputs, "-filter_complex", buildMixFilter(clips),
    "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", final,
  ], { stdio: "inherit" });
  console.log("✅ Narrated video →", final);
  return final;
}
