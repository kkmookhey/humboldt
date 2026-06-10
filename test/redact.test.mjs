import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRedactFilter } from "../lib/redact.mjs";

test("buildRedactFilter crops+blurs each region and gates overlay by time", () => {
  const { filter, out } = buildRedactFilter([
    { x: 10, y: 20, w: 100, h: 50, start: 5, end: 9 },
    { x: 30, y: 40, w: 200, h: 60, start: 12, end: 18 },
  ]);
  assert.equal(out, "vout");
  assert.equal(
    filter,
    "[0:v]split=3[base][k0][k1];" +
      "[k0]crop=100:50:10:20,boxblur=12:2[c0];" +
      "[k1]crop=200:60:30:40,boxblur=12:2[c1];" +
      "[base][c0]overlay=10:20:enable='between(t,5,9)'[v0];" +
      "[v0][c1]overlay=30:40:enable='between(t,12,18)'[vout]",
  );
});
