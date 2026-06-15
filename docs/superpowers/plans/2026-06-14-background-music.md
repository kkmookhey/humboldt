# Background Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional background-music layer to Humboldt's finished videos — played `throughout` (ducked under narration) for reels, or as `bookends` (intro/outro only) for explainer modules, or `none`.

**Architecture:** One shared, file-only mixing engine (`lib/music.mjs`) exposing a pure `buildMusicFilter` (the ffmpeg `filter_complex` builder, unit-tested like `buildMixFilter`/`buildRedactFilter`) plus `mixMusic` (runs ffmpeg) and `musicModule` (the module stage). It is called as a **final pass** by two callers: a standalone `bin/music.mjs` (run after `bin/brand.mjs`, rewrites `<id>-final.mp4` in place) and `reel/build-reel.mjs` (after its speed pass). No network/MCP at build time — tracks are local files in `assets/music/`.

**Tech Stack:** Node 20+ (ESM), `ffmpeg`/`ffprobe` on PATH, `node --test`.

> **Spec deviation (intentional):** the spec said "modify `bin/build.mjs`". In reality `bin/build.mjs` stops at `mux` and never runs `brand`; `redact`/`brand` are standalone stage CLIs. So the module music stage is a standalone `bin/music.mjs` run after brand — consistent with the existing `bin/redact.mjs` pattern. `bin/build.mjs` is **not** touched.

---

## File Structure

- `lib/music.mjs` — **new.** `resolveTrack`, `buildMusicFilter` (pure), `mixMusic`, `musicModule`. The one place mixing logic lives.
- `lib/brand.mjs` — **modify.** Export a `stingPaths(cloud)` helper and refactor `brandModule` to use it (so the music stage can ffprobe the same intro/outro stings for bookend windows — DRY).
- `lib/schema.mjs` — **modify.** Validate the optional `music` block.
- `bin/music.mjs` — **new.** Thin CLI: `node bin/music.mjs <id>`.
- `reel/build-reel.mjs` — **modify.** Call `mixMusic` after the speed pass.
- `test/music.test.mjs` — **new.** `buildMusicFilter` + `resolveTrack` tests.
- `test/schema.test.mjs` — **modify.** `music` validation cases.
- `README.md` — **modify.** Document the `music` block, the stage, and sourcing.
- skill `SKILL.md` — **modify.** Short "sourcing music" note.

---

## Task 1: Pure `buildMusicFilter` — `throughout` scope

**Files:**
- Create: `lib/music.mjs`
- Test: `test/music.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/music.test.mjs
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/music.test.mjs`
Expected: FAIL — `Cannot find module '../lib/music.mjs'` / `buildMusicFilter is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// lib/music.mjs
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
  throw new Error(`unknown music scope: ${scope}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/music.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/music.mjs test/music.test.mjs
git commit -m "feat(music): pure buildMusicFilter for throughout scope"
```

---

## Task 2: `buildMusicFilter` — `bookends` scope

**Files:**
- Modify: `lib/music.mjs`
- Test: `test/music.test.mjs`

- [ ] **Step 1: Write the failing test (append to `test/music.test.mjs`)**

```js
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
  assert.match(buildMusicFilter({ scope: "throughout", total: 10 }), /volume=-6dB/);
  assert.match(buildMusicFilter({ scope: "bookends", total: 10, introDur: 4, outroDur: 4 }), /volume=-3dB/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/music.test.mjs`
Expected: FAIL — `unknown music scope: bookends` thrown.

- [ ] **Step 3: Add the bookends branch (insert before the final `throw` in `buildMusicFilter`)**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/music.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/music.mjs test/music.test.mjs
git commit -m "feat(music): bookends scope in buildMusicFilter"
```

---

## Task 3: `resolveTrack` — local file resolution

**Files:**
- Modify: `lib/music.mjs`
- Test: `test/music.test.mjs`

- [ ] **Step 1: Write the failing test (append to `test/music.test.mjs`)**

```js
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveTrack } from "../lib/music.mjs";

test("resolveTrack finds a file by extension and throws when missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "music-"));
  fs.writeFileSync(path.join(dir, "calm.mp3"), "x");
  assert.equal(resolveTrack("calm", dir), path.join(dir, "calm.mp3"));
  assert.throws(() => resolveTrack("missing", dir), /music track not found/);
});
```

> The `import { buildMusicFilter } from "../lib/music.mjs";` at the top of the file should be widened to `import { buildMusicFilter, resolveTrack } from "../lib/music.mjs";`. Add the `fs`/`os`/`path` imports once at the top if not already present.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/music.test.mjs`
Expected: FAIL — `resolveTrack is not a function`.

- [ ] **Step 3: Add `resolveTrack` to `lib/music.mjs` (after the imports)**

```js
export function resolveTrack(name, dir = path.join(ROOT, "assets", "music")) {
  for (const ext of MUSIC_EXTS) {
    const p = path.join(dir, `${name}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`music track not found: ${path.join(dir, `${name}.{${MUSIC_EXTS.join(",")}}`)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/music.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/music.mjs test/music.test.mjs
git commit -m "feat(music): resolveTrack file lookup"
```

---

## Task 4: `stingPaths` helper in `lib/brand.mjs`

**Files:**
- Modify: `lib/brand.mjs:132-148` (the `pick`/intro/outro logic inside `brandModule`)

- [ ] **Step 1: Add the exported helper (place it just above `brandModule`)**

```js
// Resolve the intro/outro sting files for a cloud: prefer a per-cloud sting
// (e.g. intro-azure.mp4), else the default. Shared by brandModule and the
// music stage (which ffprobes these for bookend windows).
export function stingPaths(cloud) {
  const pick = (base) => {
    const perCloud = path.join(assetsDir(), `${base}-${cloud}.mp4`);
    return fs.existsSync(perCloud) ? perCloud : path.join(assetsDir(), `${base}.mp4`);
  };
  return { intro: pick("intro"), outro: pick("outro") };
}
```

- [ ] **Step 2: Refactor `brandModule` to use it**

Replace these lines in `brandModule`:

```js
  const pick = (base) => {
    const perCloud = path.join(assetsDir(), `${base}-${m.cloud}.mp4`);
    return fs.existsSync(perCloud) ? perCloud : path.join(assetsDir(), `${base}.mp4`);
  };
  const intro = pick("intro");
  const outro = pick("outro");
```

with:

```js
  const { intro, outro } = stingPaths(m.cloud);
```

- [ ] **Step 3: Run the brand tests to verify no regression**

Run: `node --test test/brand.test.mjs`
Expected: PASS (existing `buildConcatFilter` test still passes — `stingPaths` is pure resolution, untouched filter logic).

- [ ] **Step 4: Commit**

```bash
git add lib/brand.mjs
git commit -m "refactor(brand): extract stingPaths helper for reuse"
```

---

## Task 5: Schema validation for the `music` block

**Files:**
- Modify: `lib/schema.mjs:1-23` (end of `validateModule`, before `return true;`)
- Test: `test/schema.test.mjs`

- [ ] **Step 1: Write the failing tests (append to `test/schema.test.mjs`)**

```js
test("validateModule accepts a valid music block", () => {
  assert.ok(validateModule({ ...good, music: { track: "calm", scope: "bookends" } }));
});

test("validateModule rejects an unknown music scope", () => {
  assert.throws(() => validateModule({ ...good, music: { track: "calm", scope: "loud" } }), /music\.scope/);
});

test("validateModule requires a track unless scope is none", () => {
  assert.throws(() => validateModule({ ...good, music: { scope: "throughout" } }), /music\.track required/);
  assert.ok(validateModule({ ...good, music: { scope: "none" } }));
});

test("validateModule rejects a non-numeric music gain", () => {
  assert.throws(() => validateModule({ ...good, music: { track: "calm", scope: "bookends", gain: "loud" } }), /music\.gain/);
});
```

> Uses the existing `good` fixture already defined at the top of `test/schema.test.mjs`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/schema.test.mjs`
Expected: FAIL — the "rejects an unknown music scope" case does not throw (no validation yet).

- [ ] **Step 3: Add validation (insert before `return true;` in `validateModule`)**

```js
  if (m.music) {
    const scopes = ["throughout", "bookends", "none"];
    if (!scopes.includes(m.music.scope))
      throw new Error(`music.scope must be one of ${scopes.join(", ")}`);
    if (m.music.scope !== "none" && !(typeof m.music.track === "string" && m.music.track))
      throw new Error("music.track required when scope is not 'none'");
    if (m.music.gain != null && !Number.isFinite(m.music.gain))
      throw new Error("music.gain must be a number");
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/schema.test.mjs`
Expected: PASS (all schema tests).

- [ ] **Step 5: Commit**

```bash
git add lib/schema.mjs test/schema.test.mjs
git commit -m "feat(schema): validate optional music block"
```

---

## Task 6: `mixMusic` + `musicModule` + `bin/music.mjs`

**Files:**
- Modify: `lib/music.mjs`
- Create: `bin/music.mjs`

> No unit test: `mixMusic`/`musicModule` are thin ffmpeg/ffprobe + filesystem wiring around the already-tested pure `buildMusicFilter`. Verified manually in Step 4 (TDD intentionally skipped here, per CLAUDE.md §5.3 — the logic worth testing is the pure filter builder, already covered).

- [ ] **Step 1: Add `mixMusic` and `musicModule` to `lib/music.mjs`**

```js
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
```

- [ ] **Step 2: Create the CLI**

```js
// bin/music.mjs
import { loadModule } from "../lib/module.mjs";
import { musicModule } from "../lib/music.mjs";

musicModule(loadModule(process.argv[2]));
```

- [ ] **Step 3: Run the full test suite (no regressions)**

Run: `npm test`
Expected: PASS — all `test/*.test.mjs` green.

- [ ] **Step 4: Manual end-to-end verification**

```bash
# Use an already-built, branded module (e.g. aws-iam has out/aws-iam/aws-iam-final.mp4).
mkdir -p assets/music
# Drop any short royalty-free track as assets/music/calm.mp3, then:
node -e "const m=require('node:fs');const j=JSON.parse(m.readFileSync('modules/aws-iam.json'));j.music={track:'calm',scope:'bookends'};m.writeFileSync('modules/aws-iam.json',JSON.stringify(j,null,2))"
node bin/music.mjs aws-iam
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 out/aws-iam/aws-iam-final.mp4   # expect: video + audio
```
Expected: `✅ Music (bookends) → out/aws-iam/aws-iam-final.mp4`; play the file and confirm music under intro/outro only, voice clear in the body. Revert the temporary edit to `modules/aws-iam.json` afterward (`git checkout modules/aws-iam.json`).

- [ ] **Step 5: Commit**

```bash
git add lib/music.mjs bin/music.mjs
git commit -m "feat(music): mixMusic engine and bin/music.mjs stage"
```

---

## Task 7: Wire music into the reel pipeline

**Files:**
- Modify: `reel/build-reel.mjs:1-16` (imports + constants) and end of file (after `final` is produced, lines ~237-239)

- [ ] **Step 1: Add the import and a track constant**

At the top of `reel/build-reel.mjs`, alongside the existing imports:

```js
import { mixMusic, resolveTrack } from "../lib/music.mjs";
```

Near the other constants (after `const SPEED = 1.2;`):

```js
const MUSIC = "reel-energetic"; // assets/music/reel-energetic.{mp3,wav,m4a} — optional
```

- [ ] **Step 2: Add the music pass after the final mux (after the existing `console.log(... Reel → ...)` line)**

```js
// Optional music bed under the whole reel (ducked under VO). Skipped cleanly if
// the track file is absent, so reel builds never break on a missing asset.
try {
  const track = resolveTrack(MUSIC);
  const tmp = path.join(dir, "reel.music.mp4");
  mixMusic({ videoIn: final, out: tmp, scope: "throughout", track });
  fs.renameSync(tmp, final);
  console.log(`✅ Music (throughout) → ${final}`);
} catch (e) {
  console.log(`(no music: ${e.message})`);
}
```

- [ ] **Step 3: Verify it loads and degrades gracefully without a track**

Run: `node --check reel/build-reel.mjs`
Expected: no output (valid syntax). A full reel rebuild is expensive and optional here; when run with no `assets/music/reel-energetic.*` present, the build must finish with the final log line `(no music: music track not found: …)` and leave the reel unchanged.

- [ ] **Step 4: Commit**

```bash
git add reel/build-reel.mjs
git commit -m "feat(music): add background music to the reel pipeline"
```

---

## Task 8: Documentation

**Files:**
- Modify: `README.md`
- Modify: the skill `SKILL.md` (locate with the command below)

- [ ] **Step 1: README — add the music stage to "Run individual stages" (after the `redact` line, around `README.md:79`)**

```markdown
node bin/music.mjs   <id>    # lay music bed → rewrites out/<id>/<id>-final.mp4 in place
```

- [ ] **Step 2: README — add `music` to the Module schema "Optional" list (around `README.md:90-94`)**

```markdown
- `music{track, scope, gain?}` — optional background music. `track` names a file in
  `assets/music/<track>.{mp3,wav,m4a}`. `scope` is `"throughout"` (bed under the whole
  video, auto-ducked beneath narration — use for reels), `"bookends"` (intro/outro only —
  use for explainers), or `"none"`. `gain` (dB) trims the bed; defaults to −6 (throughout)
  / −3 (bookends). Run `node bin/music.mjs <id>` after `brand`; re-runnable instantly.
```

- [ ] **Step 3: README — add a "Sourcing music" note (new short subsection after "Before publishing")**

```markdown
## Sourcing music

Tracks are plain files in `assets/music/` (git-ignored, like all of `assets/`). Drop in a
licensed/royalty-free track named to match the module's `music.track`. AI-generated music
is an **authoring-time** step — generate a clip (e.g. via the Higgsfield `generate_audio`
MCP in a Claude Code session), save it as `assets/music/<name>.mp3`, and reference it by
name. The build tooling itself never calls out to a network/MCP, so builds stay reproducible.
```

- [ ] **Step 4: Skill — add the same sourcing note**

Run: `ls .claude/skills/cloud-course-studio/SKILL.md` (the cloud-course-studio skill).
Append a short note under its workflow/quality section:

```markdown
- **Background music (optional):** to add a bed, set `music{track,scope}` on the module
  (`scope: "bookends"` for explainers, `"throughout"` for reels) and ensure
  `assets/music/<track>.mp3` exists. Generate a track with the Higgsfield `generate_audio`
  MCP and save it there, or use a licensed file. Apply with `node bin/music.mjs <id>` after
  `bin/brand.mjs`.
```

- [ ] **Step 5: Commit**

```bash
git add README.md .claude/skills/cloud-course-studio/SKILL.md
git commit -m "docs(music): document music block, stage, and sourcing"
```

---

## Final verification

- [ ] Run `npm test` — all green (music filter tests + schema tests + existing brand/mux/redact tests).
- [ ] Confirm `node bin/music.mjs aws-iam` produces a playable `out/aws-iam/aws-iam-final.mp4` with the expected bed (manual listen).
- [ ] Confirm a module with no `music` block still builds and brands exactly as before (back-compat).
