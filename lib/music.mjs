import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, outDir } from "./config.mjs";
import { stingPaths } from "./brand.mjs";

const MUSIC_EXTS = ["mp3", "wav", "m4a"];
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11";
const defaultGain = (scope) => (scope === "throughout" ? -6 : -3);

export function resolveTrack(name, dir = path.join(ROOT, "assets", "music")) {
  for (const ext of MUSIC_EXTS) {
    const p = path.join(dir, `${name}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`music track not found: ${path.join(dir, `${name}.{${MUSIC_EXTS.join(",")}}`)}`);
}

// Pure: build the ffmpeg filter_complex that lays a music bed under the
// existing voice track [0:a], with the looped music as [1:a]. Exposed for tests.
export function buildMusicFilter({ scope, total, introDur, outroDur, gain }) {
  const g = Number.isFinite(gain) ? gain : defaultGain(scope);
  if (scope === "throughout") {
    // Duck the bed beneath narration (voice as sidechain), then mix and
    // loudness-normalize to the same -16 LUFS target as the voice-only mux.
    const fadeOut = (total - 0.6).toFixed(2);
    return [
      `[0:a]asplit=2[voice][sc]`,
      `[1:a]atrim=0:${total},asetpts=N/SR/TB,volume=${g}dB[bed]`,
      `[bed][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[ducked]`,
      `[ducked][voice]amix=inputs=2:normalize=0:dropout_transition=0[m]`,
      `[m]afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOut}:d=0.6[fa]`,
      `[fa]${LOUDNORM}[aout]`,
    ].join(";");
  }
  if (scope === "bookends") {
    // Two beds — one over the intro window [0,introDur], one over the outro
    // window [total-outroDur,total]; silent under the body. No ducking needed
    // (the stings carry no voice).
    const inFade = (introDur - 0.6).toFixed(2);
    const outFade = (outroDur - 0.6).toFixed(2);
    const delay = Math.round((total - outroDur) * 1000);
    return [
      `[1:a]asplit=2[m1][m2]`,
      `[m1]atrim=0:${introDur},asetpts=N/SR/TB,volume=${g}dB,afade=t=in:st=0:d=0.6,afade=t=out:st=${inFade}:d=0.6[intro]`,
      `[m2]atrim=0:${outroDur},asetpts=N/SR/TB,volume=${g}dB,afade=t=in:st=0:d=0.6,afade=t=out:st=${outFade}:d=0.6,adelay=${delay}|${delay}[outro]`,
      `[0:a][intro][outro]amix=inputs=3:normalize=0:dropout_transition=0[m]`,
      `[m]${LOUDNORM}[aout]`,
    ].join(";");
  }
  throw new Error(`unknown music scope: ${scope}`);
}

const probe = (f) =>
  parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])
      .toString()
      .trim(),
  );

// Lay a ducked/gated music bed under videoIn's existing audio → out.
// introDur/outroDur are required only for the bookends scope.
export function mixMusic({ videoIn, out, scope, track, gain, introDur, outroDur }) {
  const total = probe(videoIn);
  const filter = buildMusicFilter({ scope, total, introDur, outroDur, gain });
  execFileSync("ffmpeg", [
    "-y", "-i", videoIn, "-stream_loop", "-1", "-i", track,
    "-filter_complex", filter, "-map", "0:v", "-map", "[aout]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out,
  ], { stdio: "inherit" });
  return out;
}

// Module stage: rewrite <id>-final.mp4 in place with its music bed.
export function musicModule(m) {
  const spec = m.music;
  if (!spec || spec.scope === "none") {
    console.log(`no music for ${m.id} — skipping`);
    return null;
  }
  const dir = outDir(m.id);
  const videoIn = path.join(dir, `${m.id}-final.mp4`);
  if (!fs.existsSync(videoIn)) throw new Error(`missing ${videoIn} — run brand first`);
  const track = resolveTrack(spec.track);
  let introDur, outroDur;
  if (spec.scope === "bookends") {
    const { intro, outro } = stingPaths(m.cloud);
    introDur = probe(intro);
    outroDur = probe(outro);
  }
  const tmp = path.join(dir, `${m.id}-final.music.mp4`);
  mixMusic({ videoIn, out: tmp, scope: spec.scope, track, gain: spec.gain, introDur, outroDur });
  fs.renameSync(tmp, videoIn);
  console.log(`✅ Music (${spec.scope}) → ${videoIn}`);
  return videoIn;
}
