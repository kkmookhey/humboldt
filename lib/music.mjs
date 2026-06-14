import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, outDir } from "./config.mjs";
import { stingPaths } from "./brand.mjs";

const MUSIC_EXTS = ["mp3", "wav", "m4a"];
const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11";
const defaultGain = (scope) => (scope === "throughout" ? -6 : -3);

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
