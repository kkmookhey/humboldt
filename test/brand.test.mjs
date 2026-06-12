import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConcatFilter } from "../lib/brand.mjs";

test("buildConcatFilter normalizes each input and concats them", () => {
  const f = buildConcatFilter(3);
  // one normalize block per input
  assert.match(f, /\[0:v\]scale=1920:1080/);
  assert.match(f, /\[2:a\]aresample=48000/);
  // concat over all three v/a pairs
  assert.match(f, /\[v0\]\[a0\]\[v1\]\[a1\]\[v2\]\[a2\]concat=n=3:v=1:a=1\[v\]\[a\]/);
});
