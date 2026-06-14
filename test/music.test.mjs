import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMusicFilter } from "../lib/music.mjs";

test("buildMusicFilter throughout ducks the bed under voice and normalizes", () => {
  const f = buildMusicFilter({ scope: "throughout", total: 60, gain: -6 });
  assert.match(f, /\[0:a\]asplit=2\[voice\]\[sc\]/);
  assert.match(f, /\[1:a\]atrim=0:60,asetpts=N\/SR\/TB,volume=-6dB\[bed\]/);
  assert.match(f, /\[bed\]\[sc\]sidechaincompress=threshold=0\.03:ratio=8:attack=20:release=400\[ducked\]/);
  assert.match(f, /\[ducked\]\[voice\]amix=inputs=2:normalize=0:dropout_transition=0\[m\]/);
  assert.match(f, /afade=t=in:st=0:d=0\.6,afade=t=out:st=59\.40:d=0\.6\[fa\]/);
  assert.match(f, /\[fa\]loudnorm=I=-16:TP=-1\.5:LRA=11\[aout\]/);
});
