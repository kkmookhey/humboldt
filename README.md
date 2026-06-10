# Cloud Course Studio

Narrated cloud-console training videos from one JSON file per module.

## Setup
Requires **ffmpeg** + **ffprobe** on PATH (`brew install ffmpeg`).
```bash
npm install && npx playwright install chromium
echo "OPENAI_API_KEY=sk-..." > .env
```

## Make a module
1. Author `modules/<id>.json` (see `modules/aws-iam.json`).
2. Capture auth once per cloud: `node bin/login.mjs aws`
3. Build: `node bin/build.mjs <id>`
4. Output: `out/<id>/<id>-narrated.mp4`

## Individual steps
- `node bin/gen-audio.mjs <id>` — TTS → `out/<id>/audio/`
- `node bin/record.mjs <id>` — screen recording → `out/<id>/silent.mp4` + `timing.json`
- `node bin/mux.mjs <id>` — overlay audio → `out/<id>/<id>-narrated.mp4`

## Tests
`npm test`

## Before publishing
Real consoles expose account IDs, ARNs, usernames, and keys — blur them.
