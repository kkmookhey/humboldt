import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMixFilter } from "../lib/mux.mjs";

test("buildMixFilter delays each input, mixes them, and loudness-normalizes", () => {
  const clips = [{ offset: 0 }, { offset: 2.5 }];
  const f = buildMixFilter(clips);
  assert.equal(
    f,
    "[1:a]adelay=0:all=1[a0];[2:a]adelay=2500:all=1[a1];[a0][a1]amix=inputs=2:normalize=0:dropout_transition=0[mix];[mix]loudnorm=I=-16:TP=-1.5:LRA=11[aout]",
  );
});
