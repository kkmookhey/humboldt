# Plan — "Action / Do This" labs + full SCS-C02 course

## Goal
1. Add a hands-on **"Action / Do This"** section to every module: 1–2 lab exercises the learner runs in their own AWS account to confirm the lesson.
2. Light **SCS-C02 exam framing**: a domain badge on the title card + a one-line exam tip in the recap.
3. Build the **complete AWS Security course**, aligned to the six SCS-C02 (AWS Certified Security – Specialty) exam domains.

## Decisions (locked with KK)
- Lab renders as **one full-screen card per exercise** (each narrated), placed **after the recap**.
- Exam prep = **exercises + light framing** (domain badge + recap exam-tip). No separate exam card.
- Rollout = **one full example first**: ship the feature, rebuild `aws-iam` end-to-end, KK reviews, then backfill + mass-produce.

## Toolkit changes (reuse the existing full-card path — minimal new code)
- `lib/schema.mjs`
  - `validateModule`: accept optional `m.action = { kicker, exercises:[{id,title,lines,narration, accent?}] }`; validate each exercise. Accept optional `m.examDomain` (string) and `m.recap.examTip` (string).
  - `segmentsOf`: after `recap`, push one segment per `action.exercises[]` (id + narration).
- `lib/overlay.mjs`
  - `paintFullCard`: add optional `badge` (top pill) and `note` (bottom highlighted box). Generic — title card uses `badge`, recap uses `note`.
- `lib/recorder.mjs`
  - Title card: pass `badge: m.examDomain`.
  - Recap card: pass `note: m.recap.examTip`.
  - After recap: for each `action.exercises[i]`, paint a full card (`badge: HANDS-ON LAB · i/n`, kicker, title, lines, accent) → `mark(ex.id)` → dwell.
- `test/schema.test.mjs`: extend the `good` fixture with `action` + assert `segmentsOf` order includes the lab segments after recap.

## Module schema delta
```jsonc
"examDomain": "Domain 4 · Identity & Access Management",
"recap": { "card": {...}, "narration": "...", "examTip": "Know roles vs users; trust vs permission policy; when STS mints temp creds." },
"action": {
  "kicker": "Do this in your lab",
  "exercises": [
    { "id": "lab-1", "title": "Exercise 1 — …", "accent": "#f0883e",
      "lines": ["GOAL · …", "1 · …", "2 · …", "✓ DONE WHEN · …"],
      "narration": "…" }
  ]
}
```

## Build verification (per module)
`node bin/build.mjs <id>` → confirm `out/<id>/<id>-narrated.mp4` has A+V streams, volumedetect shows speech, extract frames incl. the new lab card(s). Then add `redactions` + `node bin/redact.mjs <id>`.

## Course module set (SCS-C02 domains)
- D1 Threat Detection & IR: `aws-guardduty`, `aws-detective`, `aws-inspector`, `aws-incident-response`
- D2 Logging & Monitoring: `aws-cloudtrail`, `aws-config`, `aws-cloudwatch-alarms`, **`aws-securityhub` ✓**
- D3 Infrastructure Security: `aws-vpc-security`, `aws-waf-shield`, `aws-network-firewall`
- D4 Identity & Access: **`aws-iam` ✓**, `aws-identity-center`, `aws-organizations-scp`
- D5 Data Protection: **`aws-s3-security` ✓**, `aws-kms`, `aws-secrets-manager`, `aws-macie`
- D6 Governance: folded into Organizations/SCP + Config conformance modules

## Execution order
1. Toolkit changes + tests green.
2. `aws-iam`: add examDomain/examTip/action → rebuild → KK review. **(checkpoint)**
3. Backfill `aws-s3-security`, `aws-securityhub` → rebuild.
4. Author + build remaining modules, one at a time (reuse saved auth), redact each.
5. Wrap each redacted module with the brand sting: `node bin/brand.mjs <id>` → `<id>-final.mp4`.

## Branding (Network Intelligence sting) — DONE (Phase 1)
- `lib/brand.mjs` (+ `bin/make-sting.mjs`, `bin/brand.mjs`, `test/brand.test.mjs`): transparent text layer + sting compositor + concat. `assets/` gitignored.
- Constant intro/outro: "NETWORK INTELLIGENCE" + "Visit us at www.networkintelligence.ai" on the on-brand gradient. The per-module title card stays per-module (plays right after the intro).
- **Pending Higgsfield swap (after KK restarts + auths):** generate a ~4s cinematic clip via Higgsfield MCP → `node bin/make-sting.mjs <clip>` → re-`brand` modules. Text overlay unchanged.

## Known follow-ups
- **Lead-in gap:** every module shows ~6s of raw AWS console home (recorder startup/login-check, account name "kkmookhey" visible) *before* the title card. With the intro sting prepended this reads as intro → bare console → title. Fix options: (a) recorder paints the title card immediately / trims startup; (b) trim the module video's first ~6s pre-concat and shift offsets. Not yet done.
- **Pexels (Proposal B):** title-card `bg` support in `paintFullCard` — left as opt-in, not built.
