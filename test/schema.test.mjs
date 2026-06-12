import { test } from "node:test";
import assert from "node:assert/strict";
import { validateModule, segmentsOf } from "../lib/schema.mjs";

const good = {
  id: "x", cloud: "aws", voice: "alloy", model: "gpt-4o-mini-tts", instructions: "i",
  examDomain: "Domain 4 · Identity & Access Management",
  title: { kicker: "k", title: "T", lines: ["a"] },
  intro: "intro text",
  recap: { card: { kicker: "k", title: "R", accent: "#56d364", lines: ["1"] }, narration: "recap text", examTip: "exam tip" },
  sections: [
    { id: "s1", section: "S1", url: "https://x", kicker: "k", cardTitle: "C1", bullets: ["b"], narration: "n1" },
    { id: "s2", section: "S2", url: "https://y", kicker: "k", cardTitle: "C2", bullets: ["b"], narration: "n2",
      drill: { id: "s2d", section: "S2d", kicker: "k", cardTitle: "Cd", bullets: ["b"], narration: "nd" } },
  ],
  action: {
    kicker: "Do this in your lab",
    exercises: [
      { id: "lab-1", title: "Exercise 1", lines: ["GOAL", "1"], narration: "lab one" },
      { id: "lab-2", title: "Exercise 2", lines: ["GOAL", "1"], narration: "lab two" },
    ],
  },
};

test("validateModule accepts a well-formed module", () => {
  assert.equal(validateModule(good), true);
});

test("validateModule rejects a missing top-level field", () => {
  const bad = { ...good }; delete bad.sections;
  assert.throws(() => validateModule(bad), /sections/);
});

test("validateModule rejects a section missing a field", () => {
  const bad = structuredClone(good); delete bad.sections[0].narration;
  assert.throws(() => validateModule(bad), /narration/);
});

test("segmentsOf returns intro, sections, drills, recap, then lab exercises in order", () => {
  assert.deepEqual(segmentsOf(good).map((s) => s.id), ["intro", "s1", "s2", "s2d", "recap", "lab-1", "lab-2"]);
});

test("validateModule rejects an action exercise missing a field", () => {
  const bad = structuredClone(good); delete bad.action.exercises[0].narration;
  assert.throws(() => validateModule(bad), /narration/);
});

test("validateModule still accepts a module with no action block", () => {
  const noAction = structuredClone(good); delete noAction.action;
  assert.equal(validateModule(noAction), true);
});
