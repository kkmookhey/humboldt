import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildMusicFilter, resolveTrack } from "../lib/music.mjs";

test("buildMusicFilter throughout ducks the bed under voice and normalizes", () => {
  const f = buildMusicFilter({ scope: "throughout", total: 60, gain: -6 });
  assert.match(f, /\[0:a\]asplit=2\[voice\]\[sc\]/);
  assert.match(f, /\[1:a\]atrim=0:60,asetpts=N\/SR\/TB,volume=-6dB\[bed\]/);
  assert.match(f, /\[bed\]\[sc\]sidechaincompress=threshold=0\.03:ratio=8:attack=20:release=400\[ducked\]/);
  assert.match(f, /\[ducked\]\[voice\]amix=inputs=2:normalize=0:dropout_transition=0\[m\]/);
  assert.match(f, /afade=t=in:st=0:d=0\.6,afade=t=out:st=59\.40:d=0\.6\[fa\]/);
  assert.match(f, /\[fa\]loudnorm=I=-16:TP=-1\.5:LRA=11\[aout\]/);
});

test("buildMusicFilter bookends gates two segments and does not duck", () => {
  const f = buildMusicFilter({ scope: "bookends", total: 100, introDur: 4, outroDur: 4, gain: -3 });
  assert.match(f, /\[1:a\]asplit=2\[m1\]\[m2\]/);
  assert.match(f, /\[m1\]atrim=0:4,asetpts=N\/SR\/TB,volume=-3dB,afade=t=in:st=0:d=0\.6,afade=t=out:st=3\.40:d=0\.6\[intro\]/);
  assert.match(f, /\[m2\]atrim=0:4,asetpts=N\/SR\/TB,volume=-3dB,afade=t=in:st=0:d=0\.6,afade=t=out:st=3\.40:d=0\.6,adelay=96000\|96000\[outro\]/);
  assert.match(f, /\[0:a\]\[intro\]\[outro\]amix=inputs=3:normalize=0:dropout_transition=0\[m\]/);
  assert.match(f, /\[m\]loudnorm=I=-16:TP=-1\.5:LRA=11\[aout\]/);
  assert.doesNotMatch(f, /sidechaincompress/);
});

test("buildMusicFilter applies per-scope default gain", () => {
  assert.match(buildMusicFilter({ scope: "throughout", total: 10 }), /volume=-10dB/);
  assert.match(buildMusicFilter({ scope: "bookends", total: 10, introDur: 4, outroDur: 4 }), /volume=-3dB/);
});

test("resolveTrack finds a file by extension and throws when missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "music-"));
  fs.writeFileSync(path.join(dir, "calm.mp3"), "x");
  assert.equal(resolveTrack("calm", dir), path.join(dir, "calm.mp3"));
  assert.throws(() => resolveTrack("missing", dir), /music track not found/);
});
