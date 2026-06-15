# Background Music — Design Spec

**Date:** 2026-06-14
**Author:** KK Mookhey (with Claude)
**Status:** Approved for planning

## Summary

Add an optional background-music layer to Humboldt's finished videos. Music is a
new audio bed laid **under** the existing voice track, configurable per output:
played **throughout** (ducked under narration) for short-form/reels, or only as
**bookends** (intro/outro) for explainer modules, or **off**.

The work is structured as a single shared mixing engine (`lib/music.mjs`) called
as a **final pass** by both pipelines — the module/explainer pipeline and the
reel pipeline. This is "Approach A" from brainstorming: one place to perfect
ducking/loudness, serving every current and future pipeline.

## Goals

- A per-module `music` setting controls scope (`throughout` / `bookends` / `none`).
- One mixing engine, reused by both the module build and the reel builder.
- Existing modules with no `music` block keep building unchanged (back-compat).
- The mix meets a high quality bar: bed ducks cleanly under voice, consistent
  loudness (−16 LUFS, matching the current voice target), smooth fades.
- Builds stay **deterministic and offline** — no network/MCP calls at build time.

## Non-goals

- Runtime AI music generation inside the toolkit. AI generation is an
  **authoring-time** action (see "Sourcing music" below), not part of `bin/*`.
- Per-section music changes, music auto-composition, beat-syncing, or stem mixing.
- A music library/management UI. Tracks are plain files in `assets/music/`.

## Key constraint: the toolkit binary is file-only

The node CLIs (`bin/*.mjs`) cannot call MCP tools — Higgsfield/Suno are only
reachable by Claude in-session, not from a build script. Therefore the mixing
engine consumes **local audio files only** and performs no network I/O. This
keeps builds reproducible and matches the repo's conventions (one runtime dep,
`playwright`; everything else via `ffmpeg`/`ffprobe`).

## Architecture

```
build: gen-audio → record → mux → redact → brand → music (in-place, if spec) → <id>-final.mp4
reel:  …                  → speed pass    → music (throughout)               → <id>-reel.mp4
```

The music stage is the **last** step in each pipeline. Placing it after `brand`
in the module pipeline means `throughout` spans intro + body + outro, and
`bookends` maps to the real intro/outro sting windows.

## Components

### 1. Module schema — `lib/schema.mjs`

New optional `music` block on a module:

```jsonc
"music": {
  "track": "calm-corporate",   // → assets/music/calm-corporate.{mp3,wav,m4a}
  "scope": "bookends",         // "throughout" | "bookends" | "none"
  "gain": -2                    // optional dB trim on the bed; default per scope
}
```

`validateModule` additions:
- If `music` is present: `scope` must be one of `throughout` | `bookends` | `none`.
- If `music` present and `scope !== "none"`: `track` is required (non-empty string).
- `gain`, when present, must be a finite number.
- Absent `music` block is valid — means no music.

### 2. Engine — `lib/music.mjs` (new)

The single place mixing logic lives.

- `resolveTrack(name)` → resolves `assets/music/<name>.{mp3,wav,m4a}` (first
  existing extension). Throws a clear error naming the expected path when none
  exists, mirroring `brand.mjs`'s missing-sting error. **No MCP/network.**

- `buildMusicFilter({ scope, total, introDur, outroDur, gain })` → **pure**
  function returning the ffmpeg `filter_complex` string. This is the unit-test
  seam, exactly like `buildMixFilter` (`lib/mux.mjs`) and `buildRedactFilter`
  (`lib/redact.mjs`). Behaviour by scope:
  - **`throughout`**: loop + trim the bed to `total`, `sidechaincompress` keyed
    off the video's existing voice track so the bed ducks while narration plays,
    `amix` bed + voice, `afade` 0.6s in/out, `loudnorm I=-16:TP=-1.5:LRA=11`.
  - **`bookends`**: two bed segments gated to `[0, introDur]` and
    `[total - outroDur, total]` via `atrim` + `adelay` + `afade`; silent under
    the body; `amix` with the voice track. No sidechain needed (stings carry no
    voice). Final `loudnorm` as above.
  - **`none`**: not handled here — the caller skips the stage entirely.

- `mixMusic({ videoIn, scope, track, gain, out })` → ffprobes `videoIn`
  duration; for `bookends`, resolves intro/outro durations by reusing `brand`'s
  sting-resolution + `ffprobe`; calls `buildMusicFilter`; runs `ffmpeg`; writes
  `out`. Re-encodes audio to AAC 192k (matching the rest of the pipeline);
  copies video stream (`-c:v copy`) — music never touches the picture.

### 3. Module wiring — `bin/build.mjs` + `bin/music.mjs`

- `bin/build.mjs`: after `brandModule`, if the module has a `music` block with
  `scope !== "none"`, run the music stage. `brand` keeps writing
  `<id>-final.mp4`; the music stage rewrites it **in place via a temp file**
  (write `<id>-final.tmp.mp4`, then rename over `<id>-final.mp4`). This preserves
  the README contract that `<id>-final.mp4` is the publish artifact. No `music`
  block or `scope: none` → stage skipped, output identical to today.

- `bin/music.mjs <id>` (new, thin CLI): re-applies just the music pass to the
  existing `<id>-final.mp4` — instant, no rebuild — mirroring `bin/redact.mjs`'s
  "re-run one stage" ergonomics. Reads the module's `music` block.

### 4. Reel wiring — `reel/build-reel.mjs`

After the existing speed pass produces `aws-iam-reel.mp4`, call
`mixMusic({ scope: "throughout", track: <chosen> })`. Reels are bespoke scripts
(not schema-driven), so the track name is a constant in the script. This proves
the shared engine serves both pipelines.

## Sourcing music (authoring-time, outside the build path)

When a generated track is wanted, Claude (in-session) calls Higgsfield
`generate_audio` — or KK licenses a track — and saves it to
`assets/music/<name>.mp3`; the module references it by `track` name. Suno or any
other generator slots into this same authoring step later with **no toolkit
change**. `assets/music/` is git-ignored like other media (`out/`, `.auth/`).
The skill doc gets a short "sourcing music" note.

## Loudness / quality bar

- Voice stays at the existing target (−16 LUFS) — `sidechaincompress` ducks the
  bed beneath it rather than lowering the voice.
- Bed sits well under voice (≈ −23 LUFS effect via gain + ducking); tune
  threshold/ratio so narration is never masked.
- 0.6s fade in/out on the bed, matching the sting fade aesthetic in `brand.mjs`.
- Final `loudnorm I=-16:TP=-1.5:LRA=11` on the mixed result, consistent with
  `mux.mjs`.

## Error handling

- Missing track file → clear error naming the expected `assets/music/<name>.*` path.
- Invalid `scope` or missing `track` → schema validation error at load time.
- Missing `videoIn` (e.g. `bin/music.mjs` before a build) → "build it first" error.
- `ffprobe` duration failure → surfaced, not swallowed.

## Testing (`node --test`)

- `test/music.test.mjs` (new): assert `buildMusicFilter` output strings —
  - `throughout` contains `sidechaincompress`, `amix`, and `loudnorm`;
  - `bookends` contains two `adelay`-gated segments and **no** `sidechaincompress`.
  Follows the exact string-assertion pattern of `test/mux.test.mjs` and
  `test/redact.test.mjs`.
- `test/schema.test.mjs` (extend): valid `scope` values pass; an invalid `scope`
  and a missing `track` (with `scope !== "none"`) each throw.

## Files touched

- `lib/schema.mjs` — validate `music` block.
- `lib/music.mjs` — **new** engine (`resolveTrack`, `buildMusicFilter`, `mixMusic`).
- `bin/build.mjs` — call music stage after brand.
- `bin/music.mjs` — **new** re-apply CLI.
- `reel/build-reel.mjs` — call `mixMusic` after the speed pass.
- `test/music.test.mjs` — **new** filter-builder tests.
- `test/schema.test.mjs` — music validation cases.
- `README.md` — document the `music` block, the music stage, and `bin/music.mjs`.
- skill doc — short "sourcing music" note.

## Build sequence (vertical slices)

1. **Engine + schema, throughout path, tested end-to-end on a reel.**
   `buildMusicFilter` (throughout) + `mixMusic` + `resolveTrack` +
   `test/music.test.mjs`; wire into `reel/build-reel.mjs`; one real track in
   `assets/music/`. Produces a music-bedded reel.
2. **Bookends path + module wiring.** `buildMusicFilter` (bookends) + sting-window
   resolution; schema validation + `test/schema.test.mjs`; music stage in
   `bin/build.mjs` (in-place rewrite). Produces a bookended explainer.
3. **Re-apply CLI + docs.** `bin/music.mjs`; README + skill note.
