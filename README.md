# Humboldt

**Narrated cloud-console training videos — generated from a single JSON file per topic.**

Humboldt turns a short brief into a polished, voiced screen-recording walkthrough of a cloud console (AWS, Azure, GCP, or any web console): it scripts the narration, renders a natural voice, drives the real console on screen, paints teaching overlays paced to the narration, and muxes it all into a finished MP4. Author one module file, run one command, get a training video.

Developed by **KK Mookhey**, Founder of [Transilience AI](https://www.transilience.ai).

---

## What it does

- **Scripted teaching tours** of a live cloud console — title card → sections → optional deep-dive drill-ins → recap.
- **Natural voiceover** via OpenAI TTS (`gpt-4o-mini-tts`), one clip per section.
- **Narration-driven pacing** — each section stays on screen exactly as long as its narration, so audio and video always line up.
- **On-screen overlays** — a top ribbon + a bottom-left teaching card with the key points for each section.
- **One command per module** once a cloud is authenticated. Consistent look, structure, and quality across every topic and every cloud.

## Why it's called Humboldt

The repo follows a convention of naming projects after real mountains — and **Humboldt Peak** is a real 14,000-ft summit in Colorado's Sangre de Cristo range, named for **Alexander von Humboldt**: the polymath naturalist widely regarded as history's greatest *teacher* and communicator of the sciences, who inspired generations of explorers and thinkers. A tool whose whole job is to *teach* could ask for no better namesake — the mountain, and the teacher it honors.

## How it works

Three layers keep authoring simple and output consistent:

1. **Content schema** — a per-module JSON file (`modules/<id>.json`) describing the cloud, the sections (each with a real console URL, a teaching card, and narration), an optional drill-in, and title/recap cards. This is the only thing you author per topic.
2. **Toolkit** (`lib/` + thin CLIs in `bin/`) — the engine:
   - `gen-audio` → renders each narration segment to audio and measures its duration.
   - `record` → reuses a saved browser session, drives the console section-by-section, paints overlays, paces each section to its narration length, and writes a silent video plus a timing manifest.
   - `mux` → drops each voice clip at the exact timestamp the recorder logged and mixes it onto the video.
   - `login` → captures the console session **once per cloud** (`bin/login.mjs <cloud>`) and saves it, so every subsequent module records unattended with no further logins.
3. **Skill** — a Claude Code skill that encodes the workflow and quality bar: take a brief → draft the narration for review → build → surface the redaction checklist.

### The pipeline

```
brief ─▶ modules/<id>.json ─▶ gen-audio ─▶ record (overlays + pacing) ─▶ mux ─▶ out/<id>/<id>-narrated.mp4
                                  │                  ▲
                                  └── durations ─────┘   (auth reused from `login`, captured once per cloud)
```

## Setup

Requires **Node 20+**, **ffmpeg** + **ffprobe** on PATH (`brew install ffmpeg`), and an OpenAI API key.

```bash
npm install && npx playwright install chromium
echo "OPENAI_API_KEY=sk-..." > .env
```

## Make a module

```bash
# 1. Author modules/<id>.json (see modules/aws-iam.json for a complete reference)
# 2. Capture the console session once per cloud:
node bin/login.mjs aws
# 3. Build end-to-end:
node bin/build.mjs aws-iam
# 4. Output: out/aws-iam/aws-iam-narrated.mp4
```

### Run individual stages

```bash
node bin/gen-audio.mjs <id>   # TTS    → out/<id>/audio/
node bin/record.mjs   <id>    # record → out/<id>/silent.mp4 + timing.json
node bin/mux.mjs      <id>    # overlay audio → out/<id>/<id>-narrated.mp4
```

## Module schema

See `modules/aws-iam.json` for a complete, working reference. Required fields: `id`, `cloud`, `voice`, `model`, `title{kicker,title,lines}`, `intro`, `sections[]{id,section,url,kicker,cardTitle,bullets,narration, drill?}`, `recap{card,narration}`.

## Tests

```bash
npm test
```

## Before publishing

Real consoles expose account IDs, ARNs, usernames, and access keys on screen. **Blur sensitive regions before publishing** any rendered video. Generated videos and captured sessions live under `out/` and `.auth/`, which are git-ignored.

---

© KK Mookhey · [Transilience AI](https://www.transilience.ai)
