# Humboldt

**Narrated cloud-console training videos — generated from a single JSON file per topic.**

Humboldt turns a short brief into a polished, voiced screen-recording walkthrough of a cloud console (AWS, Azure, GCP, or any web console): it scripts the narration, renders a natural voice, drives the real console on screen, paints teaching overlays paced to the narration, and muxes it all into a finished MP4. Author one module file, run one command, get a training video.

Developed by **KK Mookhey**, Founder of [Transilience AI](https://www.transilience.ai).

---

## What it does

- **Scripted teaching tours** of a live cloud console — title card → sections → optional deep-dive drill-ins → recap → hands-on lab.
- **Natural voiceover** via OpenAI TTS (`gpt-4o-mini-tts`), one clip per section.
- **Narration-driven pacing** — each section stays on screen exactly as long as its narration, so audio and video always line up.
- **On-screen overlays** — a top ribbon + a bottom-left teaching card with the key points for each section.
- **"Do This" hands-on labs** — each module can end with one full-screen card per exercise: a goal, numbered steps, and a "done when" check the learner runs in their own account.
- **Certification framing** — an optional exam-domain badge on the title card and a one-line exam tip on the recap (e.g. AWS SCS-C02 domains).
- **Built-in redaction** — blur account IDs, ARNs, usernames, and access keys by naming regions per section; re-blur is instant (no re-record).
- **Brand stings** — a constant intro/outro wraps every video, built once and reused.
- **One command per module** once a cloud is authenticated. Consistent look, structure, and quality across every topic and every cloud.

## Why it's called Humboldt

The repo follows a convention of naming projects after real mountains — and **Humboldt Peak** is a real 14,000-ft summit in Colorado's Sangre de Cristo range, named for **Alexander von Humboldt**: the polymath naturalist widely regarded as history's greatest *teacher* and communicator of the sciences, who inspired generations of explorers and thinkers. A tool whose whole job is to *teach* could ask for no better namesake — the mountain, and the teacher it honors.

## How it works

Three layers keep authoring simple and output consistent:

1. **Content schema** — a per-module JSON file (`modules/<id>.json`) describing the cloud, the sections (each with a real console URL, a teaching card, and narration), an optional drill-in, title/recap cards, optional exam framing, optional hands-on lab exercises, and the redaction regions. This is the only thing you author per topic.
2. **Toolkit** (`lib/` + thin CLIs in `bin/`) — the engine:
   - `gen-audio` → renders each narration segment to audio and measures its duration.
   - `record` → reuses a saved browser session, drives the console section-by-section, paints overlays, paces each section to its narration length, trims the startup pre-roll so the title card is frame 1, and writes a silent video plus a timing manifest. Renders the recap and one card per lab exercise at the end.
   - `mux` → drops each voice clip at the exact timestamp the recorder logged and mixes it onto the video.
   - `redact` → blurs the regions named per section (resolved to time windows from the recorded timings) → `<id>-narrated-redacted.mp4`. Instant; no re-record.
   - `make-sting` / `brand` → builds the constant intro/outro once, then wraps a finished module with them → `<id>-final.mp4`.
   - `login` → captures the console session **once per cloud** (`bin/login.mjs <cloud>`) and saves it, so every subsequent module records unattended with no further logins.
3. **Skill** — a Claude Code skill that encodes the workflow and quality bar: take a brief → draft the narration for review → build → redact → surface the checklist.

### The pipeline

```
brief ─▶ modules/<id>.json ─▶ gen-audio ─▶ record (overlays + pacing) ─▶ mux ─▶ redact ─▶ brand ─▶ out/<id>/<id>-final.mp4
                                  │                  ▲                              ▲          ▲
                                  └── durations ─────┘    (auth from `login`)      regions   intro/outro
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
node bin/build.mjs aws-iam            # → out/aws-iam/aws-iam-narrated.mp4
# 4. Inspect frames, add `redactions` to the JSON, then blur:
node bin/redact.mjs aws-iam           # → out/aws-iam/aws-iam-narrated-redacted.mp4
# 5. Wrap with the brand intro/outro (build the stings once):
node bin/make-sting.mjs               # → assets/intro.mp4 + assets/outro.mp4 (one-time)
node bin/brand.mjs aws-iam            # → out/aws-iam/aws-iam-final.mp4 (publish this)
```

### Run individual stages

```bash
node bin/gen-audio.mjs <id>   # TTS    → out/<id>/audio/
node bin/record.mjs   <id>    # record → out/<id>/silent.mp4 + timing.json
node bin/mux.mjs      <id>    # overlay audio → out/<id>/<id>-narrated.mp4
node bin/redact.mjs   <id>    # blur regions  → out/<id>/<id>-narrated-redacted.mp4
node bin/make-sting.mjs [bg]  # build intro/outro stings (one-time; optional bg clip)
node bin/brand.mjs    <id>    # intro + module + outro → out/<id>/<id>-final.mp4
```

## Module schema

See `modules/aws-iam.json` for a complete, working reference.

**Required:** `id`, `cloud`, `voice`, `model`, `title{kicker,title,lines}`, `intro`, `sections[]{id,section,url,kicker,cardTitle,bullets,narration, drill?}`, `recap{card,narration}`.

**Optional:**
- `examDomain` — a string rendered as a badge on the title card (e.g. `"SCS-C02 · Domain 4 · Identity & Access Management"`).
- `recap.examTip` — a one-line highlighted note on the recap card.
- `action{kicker, exercises[]{id, title, lines[], narration, accent?}}` — hands-on lab; one full-screen card per exercise, played after the recap.
- `redactions[]{section, regions[]{x,y,w,h}}` — regions blurred while that section is on screen, in 1920×1080 space.

## Tests

```bash
npm test
```

## Before publishing

Real consoles expose account IDs, ARNs, usernames, and access keys on screen. **Always publish the redacted, branded `<id>-final.mp4`**, never the raw `<id>-narrated.mp4`. Workflow: build → extract a few frames from each live-console section → add the covering `regions` to the module's `redactions` → `node bin/redact.mjs <id>` → verify the blurs on the redacted frames → `node bin/brand.mjs <id>`. Generated videos, stings, and captured sessions live under `out/`, `assets/`, and `.auth/`, which are git-ignored.

---

© KK Mookhey · [Transilience AI](https://www.transilience.ai)
