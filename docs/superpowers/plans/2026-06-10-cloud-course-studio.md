# Cloud Course Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the working AWS IAM narrated-walkthrough prototype into a reusable, config-driven system so any cloud-console training module (AWS/Azure/GCP/other) is produced by authoring one JSON file and running a few commands, at consistent quality.

**Architecture:** Three layers. (1) A toolkit of focused Node ESM libraries under `lib/` with thin CLI wrappers under `bin/`. (2) A per-module content schema (`modules/<id>.json`) that Claude drafts from a brief. (3) A Claude Skill that encodes the process + quality bar and drives the toolkit. Auth is captured once per cloud (`bin/login.mjs <cloud>`) and reused via Playwright `storageState`, so recordings run unattended with no login footage to trim.

**Tech Stack:** Node 26 (ESM), Playwright (Chromium), OpenAI TTS API (`gpt-4o-mini-tts`), ffmpeg, `node:test` for unit tests. macOS host.

**Assumption (surface for approval):** New repo at `/Users/kkmookhey/Projects/cloud-course-studio/`; the existing `aws-iam-walkthrough` prototype stays as-is and IAM is re-expressed as the first module here. Skill installed at user level (`~/.claude/skills/cloud-course-studio/`) so it's available across projects.

---

## File Structure

```
cloud-course-studio/
  package.json            # type:module; dep: playwright
  .gitignore              # .env, node_modules, out, .auth
  .env                    # OPENAI_API_KEY (user-provided, gitignored)
  README.md
  lib/
    config.mjs            # paths, VIEWPORT, THEME, openaiKey()
    schema.mjs            # validateModule(), segmentsOf()   [PURE — unit tested]
    module.mjs            # loadModule(id) -> read+validate modules/<id>.json
    clouds.mjs            # per-cloud profiles (login URL, logged-in test)
    overlay.mjs           # paintOverlay(), paintFullCard()  (in-page injection)
    tts.mjs               # generateAudio(module), probeDuration()
    auth.mjs              # loginAndSave(cloud), statePath(cloud)
    recorder.mjs          # recordModule(module, manifest)
    mux.mjs               # buildMixFilter()  [PURE — unit tested], muxModule(module)
  bin/
    login.mjs             # node bin/login.mjs <cloud>
    gen-audio.mjs         # node bin/gen-audio.mjs <module-id>
    record.mjs            # node bin/record.mjs <module-id>
    mux.mjs               # node bin/mux.mjs <module-id>
    build.mjs             # node bin/build.mjs <module-id>  (gen-audio -> record -> mux)
  modules/
    aws-iam.json          # reference module (ported from the prototype)
  test/
    schema.test.mjs
    mux.test.mjs
  out/<module-id>/        # generated: audio/, silent.mp4, timing.json, <id>-narrated.mp4
```

Responsibilities: `lib/` holds all logic (each file one concern); `bin/` are 3–8 line wrappers; `modules/` is content; `test/` covers the two pure modules that carry correctness risk (schema/segment ordering, ffmpeg filter construction). Browser/TTS/ffmpeg integration is verified by building the IAM module and inspecting output (frames + `volumedetect`), exactly as the prototype was validated.

---

## Task 1: Project scaffold

**Files:**
- Create: `cloud-course-studio/package.json`
- Create: `cloud-course-studio/.gitignore`
- Create: `cloud-course-studio/lib/config.mjs`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "cloud-course-studio",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
.env
node_modules/
out/
.auth/
```

- [ ] **Step 3: Install Playwright + Chromium**

Run:
```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && npm install playwright@latest && npx playwright install chromium
```
Expected: `added N packages`; Chromium downloaded (or "is already installed").

- [ ] **Step 4: Create lib/config.mjs**

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const VIEWPORT = { width: 1920, height: 1080 };
export const THEME = {
  mono: "'JetBrains Mono','SF Mono',Menlo,Consolas,monospace",
  accent: "#58a6ff",
  accent2: "#bc8cff",
  ok: "#56d364",
  text: "#c9d1d9",
};

export const outDir = (id) => path.join(ROOT, "out", id);
export const authDir = () => path.join(ROOT, ".auth");

export function openaiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, "utf8").match(/^OPENAI_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("OPENAI_API_KEY not found (set env var or cloud-course-studio/.env)");
}
```

- [ ] **Step 5: Verify scaffold loads**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node -e "import('./lib/config.mjs').then(c=>console.log(c.VIEWPORT))"`
Expected: `{ width: 1920, height: 1080 }`

- [ ] **Step 6: Commit**

```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && git init && git add -A && git commit -m "chore: scaffold cloud-course-studio toolkit"
```

---

## Task 2: Module schema (TDD) + reference module content

**Files:**
- Create: `cloud-course-studio/lib/schema.mjs`
- Create: `cloud-course-studio/test/schema.test.mjs`
- Create: `cloud-course-studio/lib/module.mjs`
- Create: `cloud-course-studio/modules/aws-iam.json`

- [ ] **Step 1: Write the failing test**

`test/schema.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateModule, segmentsOf } from "../lib/schema.mjs";

const good = {
  id: "x", cloud: "aws", voice: "alloy", model: "gpt-4o-mini-tts", instructions: "i",
  title: { kicker: "k", title: "T", lines: ["a"] },
  intro: "intro text",
  recap: { card: { kicker: "k", title: "R", accent: "#56d364", lines: ["1"] }, narration: "recap text" },
  sections: [
    { id: "s1", section: "S1", url: "https://x", kicker: "k", cardTitle: "C1", bullets: ["b"], narration: "n1" },
    { id: "s2", section: "S2", url: "https://y", kicker: "k", cardTitle: "C2", bullets: ["b"], narration: "n2",
      drill: { id: "s2d", section: "S2d", kicker: "k", cardTitle: "Cd", bullets: ["b"], narration: "nd" } },
  ],
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

test("segmentsOf returns intro, sections, drills, recap in order", () => {
  assert.deepEqual(segmentsOf(good).map((s) => s.id), ["intro", "s1", "s2", "s2d", "recap"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node --test test/schema.test.mjs`
Expected: FAIL — `Cannot find module '../lib/schema.mjs'`

- [ ] **Step 3: Write lib/schema.mjs**

```js
export function validateModule(m) {
  const req = ["id", "cloud", "voice", "model", "title", "intro", "recap", "sections"];
  for (const k of req) if (!(k in m)) throw new Error(`module missing '${k}'`);
  if (!m.title.title) throw new Error("title.title required");
  if (!Array.isArray(m.sections) || m.sections.length === 0)
    throw new Error("sections must be a non-empty array");
  for (const s of m.sections) {
    for (const k of ["id", "section", "url", "kicker", "cardTitle", "bullets", "narration"])
      if (!(k in s)) throw new Error(`section '${s.id || "?"}' missing '${k}'`);
    if (s.drill)
      for (const k of ["id", "section", "kicker", "cardTitle", "bullets", "narration"])
        if (!(k in s.drill)) throw new Error(`drill in '${s.id}' missing '${k}'`);
  }
  if (!m.recap.card || !m.recap.narration) throw new Error("recap needs card + narration");
  return true;
}

export function segmentsOf(m) {
  const segs = [{ id: "intro", text: m.intro }];
  for (const s of m.sections) {
    segs.push({ id: s.id, text: s.narration });
    if (s.drill) segs.push({ id: s.drill.id, text: s.drill.narration });
  }
  segs.push({ id: "recap", text: m.recap.narration });
  return segs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node --test test/schema.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Write lib/module.mjs**

```js
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { validateModule } from "./schema.mjs";

export function loadModule(id) {
  if (!id) throw new Error("usage: provide a module id (file under modules/)");
  const file = path.join(ROOT, "modules", `${id}.json`);
  if (!fs.existsSync(file)) throw new Error(`module not found: ${file}`);
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  validateModule(m);
  return m;
}
```

- [ ] **Step 6: Create modules/aws-iam.json (ported from the prototype)**

```json
{
  "id": "aws-iam",
  "cloud": "aws",
  "voice": "alloy",
  "model": "gpt-4o-mini-tts",
  "instructions": "Speak like a friendly, confident cybersecurity expert explaining to a colleague. Clear and measured pace, natural emphasis on key terms, calm and authoritative — not rushed, not robotic.",
  "title": {
    "kicker": "A guided tour",
    "title": "AWS IAM",
    "lines": ["Identity & Access Management", "— core concepts + security best practices —"]
  },
  "intro": "AWS Identity and Access Management — IAM — decides who can do what in your account. Let's walk through the core building blocks, and the security best practices that matter most.",
  "sections": [
    {
      "id": "dashboard", "section": "IAM Dashboard",
      "url": "https://console.aws.amazon.com/iam/home#/home",
      "kicker": "Your security cockpit", "cardTitle": "Start at the IAM dashboard",
      "bullets": [
        "The root user has unlimited power. Lock it down: hardware MFA, no access keys, use it only for the handful of root-only tasks.",
        "Read 'Security recommendations' first — AWS flags missing MFA, stale keys and risky settings here.",
        "North star: zero standing IAM users. Federate human access through IAM Identity Center (SSO)."
      ],
      "narration": "This is the IAM dashboard, your security cockpit. Start with the security recommendations panel; AWS flags missing MFA, stale credentials, and risky settings right here. And remember, the root user has unlimited power, so protect it with hardware MFA, remove any root access keys, and use it only for the rare tasks that truly require it. Your long-term goal is zero standing IAM users."
    },
    {
      "id": "users", "section": "Users",
      "url": "https://console.aws.amazon.com/iam/home#/users",
      "kicker": "Prefer roles over long-lived users", "cardTitle": "IAM Users = standing liability",
      "bullets": [
        "Each user is a permanent identity with long-lived credentials — a credential that can leak and never expires on its own.",
        "If you must keep users: enforce MFA, never share accounts, rotate access keys, and remove console access when only programmatic access is needed.",
        "Better pattern: humans sign in via Identity Center; applications assume roles instead of holding user access keys."
      ],
      "narration": "IAM users are permanent identities with long-lived credentials. Each one is a secret that can leak and never expires on its own — a standing liability. If you must use them, enforce MFA, never share accounts, rotate access keys, and remove console access when only programmatic access is needed. The better pattern is to let humans sign in through IAM Identity Center, and let applications assume roles instead of holding access keys."
    },
    {
      "id": "groups", "section": "User groups",
      "url": "https://console.aws.amazon.com/iam/home#/groups",
      "kicker": "Attach permissions to groups, not people", "cardTitle": "Manage permissions with groups",
      "bullets": [
        "Attach policies to groups and put users in groups — never attach policies user-by-user.",
        "Model groups on job functions: Admins, Developers, ReadOnly, Billing.",
        "Result: least-privilege is auditable and offboarding is a single action."
      ],
      "narration": "Don't attach policies to users one at a time. Attach permissions to groups, and put users into those groups. Model your groups on job functions: admins, developers, read-only, billing. That keeps least privilege auditable, and offboarding someone becomes a single action."
    },
    {
      "id": "roles", "section": "Roles",
      "url": "https://console.aws.amazon.com/iam/home#/roles",
      "kicker": "Temporary credentials, done right", "cardTitle": "Roles issue short-lived credentials",
      "bullets": [
        "A role holds NO long-lived secret. It is assumed to mint short-lived STS tokens that auto-expire.",
        "Use roles for EC2/Lambda (service roles), cross-account access, and federated humans.",
        "A role = a permissions policy (what it can do) + a trust policy (who is allowed to assume it)."
      ],
      "narration": "Roles are how you grant access the right way. A role holds no long-lived secret; it's assumed to issue short-lived tokens that expire automatically. Use roles for EC2 and Lambda, for cross-account access, and for federated users. Every role has two parts: a permissions policy for what it can do, and a trust policy for who is allowed to assume it.",
      "drill": {
        "id": "trust", "section": "Roles · Trust policy", "clickText": "Trust relationships",
        "kicker": "Who may assume this role", "cardTitle": "The trust policy is the gate",
        "bullets": [
          "Principal = which account, service or federated identity can call sts:AssumeRole.",
          "Lock cross-account roles with an ExternalId and aws:SourceArn condition to stop the confused-deputy problem.",
          "Scope trust narrowly — a wide Principal ('*') is an open door."
        ],
        "narration": "Here is the trust policy. The principal defines exactly which account, service, or identity can assume the role. For cross-account access, always add an external ID and a source ARN condition to stop the confused-deputy problem. A wide-open principal is an open door, so keep it narrow."
      }
    },
    {
      "id": "policies", "section": "Policies",
      "url": "https://console.aws.amazon.com/iam/home#/policies",
      "kicker": "Least privilege is the whole game", "cardTitle": "Policies: grant only what's needed",
      "bullets": [
        "Types: AWS-managed, customer-managed, inline. Prefer customer-managed — reusable and version-controlled.",
        "Avoid wildcards like Action:'*' or 's3:*'. Name the exact actions and resources.",
        "Tighten with Conditions, Permission Boundaries, and IAM Access Analyzer to catch unused or over-broad access."
      ],
      "narration": "Policies are where least privilege lives. You'll see AWS-managed, customer-managed, and inline policies. Prefer customer-managed ones, because they are reusable and version-controlled. Avoid broad wildcards — don't allow every action, or every operation on a service; name the exact actions and resources you need. Then tighten further with conditions, permission boundaries, and IAM Access Analyzer to find unused or over-broad access."
    },
    {
      "id": "account", "section": "Account settings",
      "url": "https://console.aws.amazon.com/iam/home#/account_settings",
      "kicker": "Baseline hygiene", "cardTitle": "Set a strong account password policy",
      "bullets": [
        "Require length >= 14, complexity, expiry, and prevent password reuse.",
        "Disable STS in regions you don't use to shrink the attack surface.",
        "Pair this with: root MFA, a credential report review, and key rotation on a schedule."
      ],
      "narration": "Finally, set a strong account password policy: at least fourteen characters, complexity, expiry, and no password reuse. Disable the security token service in regions you don't operate in to shrink your attack surface, and pair all of this with root MFA, regular credential-report reviews, and scheduled key rotation."
    }
  ],
  "recap": {
    "card": {
      "kicker": "Remember", "title": "IAM in five rules", "accent": "#56d364",
      "lines": [
        "1 · Lock the root user — MFA, no keys.",
        "2 · Prefer roles & SSO over long-lived users.",
        "3 · Permissions on groups, not people.",
        "4 · Least privilege — no wildcards.",
        "5 · MFA everywhere, rotate keys, review Access Analyzer."
      ]
    },
    "narration": "In short: lock the root user; prefer roles and single sign-on over long-lived users; put permissions on groups, not people; grant least privilege with no wildcards; and turn on MFA everywhere while rotating keys and reviewing Access Analyzer. That's IAM, done right."
  }
}
```

- [ ] **Step 7: Verify the reference module validates and segments correctly**

Run:
```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && node -e "import('./lib/module.mjs').then(async ({loadModule})=>{const m=loadModule('aws-iam');const {segmentsOf}=await import('./lib/schema.mjs');console.log(segmentsOf(m).map(s=>s.id).join(','))})"
```
Expected: `intro,dashboard,users,groups,roles,trust,policies,account,recap`

- [ ] **Step 8: Commit**

```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && git add -A && git commit -m "feat: module schema, loader, and aws-iam reference module"
```

---

## Task 3: TTS generation

**Files:**
- Create: `cloud-course-studio/lib/tts.mjs`
- Create: `cloud-course-studio/bin/gen-audio.mjs`

- [ ] **Step 1: Write lib/tts.mjs**

```js
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openaiKey, outDir } from "./config.mjs";
import { segmentsOf } from "./schema.mjs";

export function probeDuration(file) {
  return parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])
      .toString().trim(),
  );
}

async function speak(key, { model, voice, instructions, input }) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, voice, input, instructions, response_format: "wav" }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function generateAudio(m) {
  const key = openaiKey();
  const dir = path.join(outDir(m.id), "audio");
  fs.mkdirSync(dir, { recursive: true });
  const manifest = [];
  for (const seg of segmentsOf(m)) {
    const raw = path.join(dir, `${seg.id}.raw.wav`);
    const wav = path.join(dir, `${seg.id}.wav`);
    fs.writeFileSync(raw, await speak(key, { model: m.model, voice: m.voice, instructions: m.instructions, input: seg.text }));
    execFileSync("ffmpeg", ["-y", "-i", raw, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", wav], { stdio: "ignore" });
    fs.rmSync(raw, { force: true });
    const d = probeDuration(wav);
    manifest.push({ id: seg.id, wav: `audio/${seg.id}.wav`, durationSec: d });
    console.log(`${seg.id.padEnd(10)} ${d.toFixed(2)}s`);
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  const total = manifest.reduce((a, b) => a + b.durationSec, 0);
  console.log(`Total narration: ${total.toFixed(1)}s`);
  return manifest;
}
```

- [ ] **Step 2: Write bin/gen-audio.mjs**

```js
import { loadModule } from "../lib/module.mjs";
import { generateAudio } from "../lib/tts.mjs";

const m = loadModule(process.argv[2]);
console.log(`Voice: ${m.voice}  Model: ${m.model}\n`);
await generateAudio(m);
```

- [ ] **Step 3: Generate IAM audio (integration check)**

Requires `cloud-course-studio/.env` with `OPENAI_API_KEY`. Copy it from the prototype if present:
```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && [ -f .env ] || cp /Users/kkmookhey/Projects/aws-iam-walkthrough/.env .env
node bin/gen-audio.mjs aws-iam
```
Expected: 9 lines (`intro … recap`) with durations, `Total narration: ~190s`, and `out/aws-iam/audio/manifest.json` created.

- [ ] **Step 4: Verify manifest**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node -e "console.log(require? '' : '');" ; cat out/aws-iam/audio/manifest.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).map(x=>x.id).join(',')))"`
Expected: `intro,dashboard,users,groups,roles,trust,policies,account,recap`

- [ ] **Step 5: Commit**

```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && git add lib/tts.mjs bin/gen-audio.mjs && git commit -m "feat: OpenAI TTS generation per module"
```

---

## Task 4: Cloud profiles + auth capture/reuse

**Files:**
- Create: `cloud-course-studio/lib/clouds.mjs`
- Create: `cloud-course-studio/lib/auth.mjs`
- Create: `cloud-course-studio/bin/login.mjs`

- [ ] **Step 1: Write lib/clouds.mjs**

```js
// Per-cloud profile: where to log in, and how to tell we're logged in.
export const CLOUDS = {
  aws: {
    home: "https://console.aws.amazon.com/console/home",
    loggedIn: (url) => /\.console\.aws\.amazon\.com/.test(url) && !/signin\./.test(url),
  },
  azure: {
    home: "https://portal.azure.com/",
    loggedIn: (url) => /portal\.azure\.com/.test(url) && !/login\.(microsoftonline|live)\./.test(url),
  },
  gcp: {
    home: "https://console.cloud.google.com/",
    loggedIn: (url) => /console\.cloud\.google\.com/.test(url) && !/accounts\.google\.com/.test(url),
  },
};
```

- [ ] **Step 2: Write lib/auth.mjs**

```js
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { authDir, VIEWPORT } from "./config.mjs";
import { CLOUDS } from "./clouds.mjs";

export const statePath = (cloud) => path.join(authDir(), `${cloud}.json`);

export async function loginAndSave(cloud) {
  const prof = CLOUDS[cloud];
  if (!prof) throw new Error(`unknown cloud '${cloud}' (known: ${Object.keys(CLOUDS).join(", ")})`);
  fs.mkdirSync(authDir(), { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ["--window-size=1920,1080", "--window-position=0,0"] });
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await page.goto(prof.home, { waitUntil: "domcontentloaded" }).catch(() => {});
  console.log(`\nLog into ${cloud.toUpperCase()} (with MFA) in the window. Waiting up to 5 minutes...`);
  const start = Date.now();
  while (Date.now() - start < 300000) {
    if (prof.loggedIn(page.url())) break;
    await page.waitForTimeout(2000);
  }
  if (!prof.loggedIn(page.url())) {
    await browser.close();
    throw new Error("login timed out");
  }
  await page.waitForTimeout(2000);
  await ctx.storageState({ path: statePath(cloud) });
  await browser.close();
  console.log("✅ Saved auth state →", statePath(cloud));
}
```

- [ ] **Step 3: Write bin/login.mjs**

```js
import { loginAndSave } from "../lib/auth.mjs";

const cloud = process.argv[2];
if (!cloud) {
  console.error("usage: node bin/login.mjs <aws|azure|gcp>");
  process.exit(1);
}
await loginAndSave(cloud);
```

- [ ] **Step 4: Capture AWS auth (integration — interactive)**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node bin/login.mjs aws`
Action: a Chrome window opens; log into the sandbox + MFA. Expected: `✅ Saved auth state → …/.auth/aws.json`.

- [ ] **Step 5: Verify state file exists and is non-trivial**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node -e "const s=require('fs').statSync('.auth/aws.json');console.log('bytes',s.size)"`
Expected: `bytes` > 1000.

- [ ] **Step 6: Commit (state file is gitignored)**

```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && git add lib/clouds.mjs lib/auth.mjs bin/login.mjs && git commit -m "feat: per-cloud auth capture and reuse via storageState"
```

---

## Task 5: Overlay + recorder

**Files:**
- Create: `cloud-course-studio/lib/overlay.mjs`
- Create: `cloud-course-studio/lib/recorder.mjs`
- Create: `cloud-course-studio/bin/record.mjs`

- [ ] **Step 1: Write lib/overlay.mjs**

```js
import { THEME } from "./config.mjs";

export async function paintOverlay(page, data) {
  await page.evaluate(({ d, mono }) => {
    const ID = "ccs-coach";
    document.getElementById(ID)?.remove();
    document.getElementById(ID + "-ribbon")?.remove();

    const ribbon = document.createElement("div");
    ribbon.id = ID + "-ribbon";
    Object.assign(ribbon.style, {
      position: "fixed", top: "0", left: "0", right: "0", height: "52px", display: "flex",
      alignItems: "center", justifyContent: "space-between", padding: "0 28px",
      background: "rgba(6,8,13,0.92)", borderBottom: "2px solid #58a6ff", color: "#e6edf3",
      fontFamily: mono, fontSize: "20px", letterSpacing: "1px", zIndex: "2147483647", pointerEvents: "none",
    });
    const left = document.createElement("span");
    const brand = document.createElement("b"); brand.style.color = "#58a6ff"; brand.textContent = d.brand;
    left.appendChild(brand); left.appendChild(document.createTextNode("   ·   " + d.subtitle));
    const right = document.createElement("span"); right.style.color = "#9aa7b6";
    right.textContent = `${d.section}   ${d.idx}/${d.total}`;
    ribbon.appendChild(left); ribbon.appendChild(right);
    document.body.appendChild(ribbon);

    const card = document.createElement("div");
    card.id = ID;
    Object.assign(card.style, {
      position: "fixed", left: "48px", bottom: "48px", width: "880px", maxWidth: "60vw",
      padding: "26px 30px", background: "rgba(13,17,23,0.95)", border: "1px solid #1f2733",
      borderLeft: "5px solid #58a6ff", borderRadius: "16px", boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
      color: "#e6edf3", fontFamily: mono, zIndex: "2147483647", opacity: "0",
      transform: "translateY(14px)", transition: "opacity .5s ease, transform .5s ease", pointerEvents: "none",
    });
    const kicker = document.createElement("div");
    kicker.textContent = d.kicker.toUpperCase();
    Object.assign(kicker.style, { color: "#bc8cff", fontSize: "16px", letterSpacing: "3px", marginBottom: "6px" });
    const title = document.createElement("div");
    title.textContent = d.title;
    Object.assign(title.style, { color: "#fff", fontSize: "34px", fontWeight: "800", lineHeight: "1.2", marginBottom: "16px" });
    const ul = document.createElement("ul");
    Object.assign(ul.style, { margin: "0", padding: "0", listStyle: "none" });
    d.bullets.forEach((b) => {
      const li = document.createElement("li");
      Object.assign(li.style, { position: "relative", paddingLeft: "26px", marginBottom: "12px", fontSize: "23px", lineHeight: "1.45", color: "#c9d1d9" });
      const dot = document.createElement("span"); dot.textContent = "▸";
      Object.assign(dot.style, { position: "absolute", left: "0", color: "#56d364" });
      li.appendChild(dot); li.appendChild(document.createTextNode(" " + b));
      ul.appendChild(li);
    });
    card.appendChild(kicker); card.appendChild(title); card.appendChild(ul);
    document.body.appendChild(card);
    requestAnimationFrame(() => { card.style.opacity = "1"; card.style.transform = "translateY(0)"; });
  }, { d: data, mono: THEME.mono }).catch(() => {});
}

export async function paintFullCard(page, { kicker, title, lines, accent = "#58a6ff" }) {
  await page.goto("about:blank");
  await page.evaluate(({ d, mono }) => {
    Object.assign(document.body.style, {
      margin: "0", height: "100vh", display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: "center",
      background: "radial-gradient(1000px 650px at 50% 35%, #101a2b 0%, #06080d 70%)",
      fontFamily: mono, color: "#e6edf3",
    });
    const k = document.createElement("div"); k.textContent = d.kicker.toUpperCase();
    Object.assign(k.style, { color: d.accent, letterSpacing: "8px", fontSize: "24px" });
    const t = document.createElement("div"); t.textContent = d.title;
    Object.assign(t.style, { fontSize: "72px", fontWeight: "800", margin: "16px 0 28px", textAlign: "center" });
    document.body.appendChild(k); document.body.appendChild(t);
    (d.lines || []).forEach((line) => {
      const el = document.createElement("div"); el.textContent = line;
      Object.assign(el.style, { fontSize: "30px", color: "#c9d1d9", margin: "6px 0", textAlign: "center" });
      document.body.appendChild(el);
    });
  }, { d: { kicker, title, lines, accent }, mono: THEME.mono });
}
```

- [ ] **Step 2: Write lib/recorder.mjs**

```js
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { VIEWPORT, outDir } from "./config.mjs";
import { CLOUDS } from "./clouds.mjs";
import { statePath } from "./auth.mjs";
import { paintOverlay, paintFullCard } from "./overlay.mjs";

const PAD = 1.0;

async function runDrill(page, s, total, dwell, mark) {
  const d = s.drill;
  try {
    const link = page.locator("table a, [role='row'] a").first();
    await link.waitFor({ state: "visible", timeout: 6000 });
    await link.click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    if (d.clickText) {
      await page.getByText(d.clickText, { exact: false }).first().click({ timeout: 4000 });
      await page.waitForTimeout(1500);
    }
    await paintOverlay(page, {
      brand: "CLOUD COURSE", subtitle: s.section, section: d.section, idx: "•", total: String(total),
      kicker: d.kicker, title: d.cardTitle, bullets: d.bullets,
    });
    mark(d.id);
    await page.waitForTimeout(dwell(d.id));
  } catch { /* best-effort drill; skip if console layout differs */ }
}

export async function recordModule(m, manifest) {
  const prof = CLOUDS[m.cloud];
  const state = statePath(m.cloud);
  if (!fs.existsSync(state)) throw new Error(`No saved auth for ${m.cloud}. Run: node bin/login.mjs ${m.cloud}`);

  const dur = Object.fromEntries(manifest.map((x) => [x.id, x.durationSec]));
  const dwell = (id) => Math.round(((dur[id] ?? 8) + PAD) * 1000);

  const dir = outDir(m.id);
  const vdir = path.join(dir, "video");
  fs.mkdirSync(vdir, { recursive: true });

  const browser = await chromium.launch({ headless: false, args: ["--window-size=1920,1080", "--window-position=0,0"] });
  const ctx = await browser.newContext({ viewport: VIEWPORT, storageState: state, recordVideo: { dir: vdir, size: VIEWPORT } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const offsets = {};
  const mark = (id) => { offsets[id] = (Date.now() - t0) / 1000; };
  const subtitle = m.title.title;
  const total = m.sections.length;

  // verify the saved session is still valid
  await page.goto(prof.home, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(2500);
  if (!prof.loggedIn(page.url())) {
    await browser.close();
    throw new Error(`Saved auth for ${m.cloud} looks stale. Re-run: node bin/login.mjs ${m.cloud}`);
  }

  await paintFullCard(page, m.title);
  mark("intro");
  await page.waitForTimeout(dwell("intro"));

  for (let i = 0; i < m.sections.length; i++) {
    const s = m.sections[i];
    console.log(`>> [${i + 1}/${total}] ${s.section} (${(dur[s.id] ?? 8).toFixed(1)}s)`);
    await page.goto(s.url, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    await paintOverlay(page, {
      brand: "CLOUD COURSE", subtitle, section: s.section, idx: String(i + 1), total: String(total),
      kicker: s.kicker, title: s.cardTitle, bullets: s.bullets,
    });
    mark(s.id);
    await page.waitForTimeout(dwell(s.id));
    if (s.drill) await runDrill(page, s, total, dwell, mark);
  }

  await paintFullCard(page, { kicker: m.recap.card.kicker, title: m.recap.card.title, accent: m.recap.card.accent, lines: m.recap.card.lines });
  mark("recap");
  await page.waitForTimeout(dwell("recap"));

  const video = page.video();
  await ctx.close();
  await browser.close();
  const raw = await video.path();
  const silent = path.join(dir, "silent.mp4");
  execFileSync("ffmpeg", ["-y", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: "inherit" });
  fs.rmSync(raw, { force: true });
  fs.writeFileSync(path.join(dir, "timing.json"), JSON.stringify({ offsets }, null, 2));
  console.log("✅ Silent video →", silent);
  return { silent, offsets };
}
```

- [ ] **Step 3: Write bin/record.mjs**

```js
import fs from "node:fs";
import path from "node:path";
import { loadModule } from "../lib/module.mjs";
import { outDir } from "../lib/config.mjs";
import { recordModule } from "../lib/recorder.mjs";

const m = loadModule(process.argv[2]);
const manifestPath = path.join(outDir(m.id), "audio", "manifest.json");
if (!fs.existsSync(manifestPath)) throw new Error(`Run gen-audio first: node bin/gen-audio.mjs ${m.id}`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
await recordModule(m, manifest);
```

- [ ] **Step 4: Record the IAM module (integration, unattended after auth)**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node bin/record.mjs aws-iam`
Expected: prints `>> [1/6] … [6/6]`, then `✅ Silent video → out/aws-iam/silent.mp4`; `out/aws-iam/timing.json` has offsets for `intro,dashboard,users,groups,roles,trust,policies,account,recap`.

- [ ] **Step 5: Verify timing offsets are monotonic and cover all segments**

Run:
```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && node -e "const t=require('./out/aws-iam/timing.json').offsets;const k=Object.keys(t);console.log(k.join(','));const v=Object.values(t);console.log('monotonic', v.every((x,i)=>i===0||x>v[i-1]))"
```
Expected: keys include all 9 ids; `monotonic true`.

- [ ] **Step 6: Commit**

```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && git add lib/overlay.mjs lib/recorder.mjs bin/record.mjs && git commit -m "feat: config-driven recorder with reusable auth and overlays"
```

---

## Task 6: Mux (TDD pure filter) + build pipeline

**Files:**
- Create: `cloud-course-studio/lib/mux.mjs`
- Create: `cloud-course-studio/test/mux.test.mjs`
- Create: `cloud-course-studio/bin/mux.mjs`
- Create: `cloud-course-studio/bin/build.mjs`

- [ ] **Step 1: Write the failing test**

`test/mux.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMixFilter } from "../lib/mux.mjs";

test("buildMixFilter delays each input and mixes them", () => {
  const clips = [{ offset: 0 }, { offset: 2.5 }];
  const f = buildMixFilter(clips);
  assert.equal(
    f,
    "[1:a]adelay=0:all=1[a0];[2:a]adelay=2500:all=1[a1];[a0][a1]amix=inputs=2:normalize=0:dropout_transition=0[aout]",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node --test test/mux.test.mjs`
Expected: FAIL — `Cannot find module '../lib/mux.mjs'`.

- [ ] **Step 3: Write lib/mux.mjs**

```js
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { outDir } from "./config.mjs";

export function buildMixFilter(clips) {
  const delays = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.offset * 1000)}:all=1[a${i}]`).join(";");
  const mix = clips.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${clips.length}:normalize=0:dropout_transition=0[aout]`;
  return `${delays};${mix}`;
}

export function muxModule(m) {
  const dir = outDir(m.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "audio", "manifest.json"), "utf8"));
  const timing = JSON.parse(fs.readFileSync(path.join(dir, "timing.json"), "utf8"));
  const silent = path.join(dir, "silent.mp4");
  if (!fs.existsSync(silent)) throw new Error(`missing ${silent} — run record first`);

  const clips = manifest
    .filter((x) => timing.offsets[x.id] != null)
    .map((x) => ({ ...x, offset: timing.offsets[x.id] }))
    .sort((a, b) => a.offset - b.offset);
  if (!clips.length) throw new Error("no clips have timing offsets");

  const inputs = ["-i", silent];
  clips.forEach((c) => inputs.push("-i", path.join(dir, c.wav)));
  const final = path.join(dir, `${m.id}-narrated.mp4`);
  execFileSync("ffmpeg", [
    "-y", ...inputs, "-filter_complex", buildMixFilter(clips),
    "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", final,
  ], { stdio: "inherit" });
  console.log("✅ Narrated video →", final);
  return final;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && node --test test/mux.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write bin/mux.mjs**

```js
import { loadModule } from "../lib/module.mjs";
import { muxModule } from "../lib/mux.mjs";

muxModule(loadModule(process.argv[2]));
```

- [ ] **Step 6: Write bin/build.mjs**

```js
import { loadModule } from "../lib/module.mjs";
import { generateAudio } from "../lib/tts.mjs";
import { recordModule } from "../lib/recorder.mjs";
import { muxModule } from "../lib/mux.mjs";

const m = loadModule(process.argv[2]);
console.log(`Building module: ${m.id}\n`);
const manifest = await generateAudio(m);
await recordModule(m, manifest);
muxModule(m);
```

- [ ] **Step 7: Mux the IAM module and verify audio (integration)**

Run:
```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && node bin/mux.mjs aws-iam
ffprobe -v error -show_entries stream=codec_type -of csv=p=0 out/aws-iam/aws-iam-narrated.mp4
ffmpeg -hide_banner -ss 20 -t 15 -i out/aws-iam/aws-iam-narrated.mp4 -map 0:a -af volumedetect -f null - 2>&1 | grep mean_volume
```
Expected: `video` and `audio` streams present; `mean_volume` around −20 to −26 dB (real speech, not silence).

- [ ] **Step 8: Commit**

```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && git add lib/mux.mjs test/mux.test.mjs bin/mux.mjs bin/build.mjs && git commit -m "feat: audio mux + end-to-end build pipeline"
```

---

## Task 7: Author the Skill

**Files:**
- Create: `~/.claude/skills/cloud-course-studio/SKILL.md`

- [ ] **Step 1: Invoke the skill-creator skill**

Use the `skill-creator` skill to scaffold a skill named `cloud-course-studio`. Provide it the spec in Step 2 as the skill's purpose and body. (skill-creator handles frontmatter, directory, and validation.)

- [ ] **Step 2: SKILL.md content to author**

Frontmatter `name: cloud-course-studio`, and a `description` covering: "Use when creating narrated cloud-console training videos/courses (AWS, Azure, GCP, or other console walkthroughs). Triggers on 'make a training video', 'build a course module', 'record a console walkthrough', 'add a module to the AWS/Azure/GCP course'." Body:

```markdown
# Cloud Course Studio

Produces narrated, paced screen-recording training videos of cloud consoles, at consistent quality, from a single per-module JSON file.

Toolkit lives at /Users/kkmookhey/Projects/cloud-course-studio. All commands run from there.

## Workflow (follow in order)

1. **Take the brief.** Ask the user only for: the cloud (aws/azure/gcp), the topic (e.g. "S3 security"), and any must-cover points. Default everything else.
2. **Draft the module JSON** at `modules/<cloud>-<topic>.json` following the schema below. YOU write the narration and bullets from your own domain knowledge + the brief. Rules:
   - 5–8 sections; each = one valid console URL + a 3-bullet teaching card + 2–4 sentences of narration.
   - Every command/URL must be real and correct. Never invent console paths or API names.
   - Narration: friendly expert tone, natural pronunciation (no symbol spelling — write "ARN", "STS", "wildcards", not "A-R-N").
   - Always include a title card, a 5-rule recap, and the redaction reminder at the end.
   - Optional `drill` on one section to open a detail view (list row -> tab) for depth.
3. **Show the draft narration to the user for approval** before generating anything.
4. **Ensure auth once per cloud:** if `.auth/<cloud>.json` is missing, tell the user to run `node bin/login.mjs <cloud>` and log in. Reused across all modules for that cloud.
5. **Build:** `node bin/build.mjs <module-id>` (gen-audio → record → mux). Recording is unattended once auth exists.
6. **Verify before declaring done:** confirm `out/<id>/<id>-narrated.mp4` has audio+video streams and `volumedetect` shows real speech; extract 3–4 frames and look at them.
7. **Redaction reminder (MANDATORY):** real consoles show account IDs, ARNs, usernames, keys. List the exact timestamps/sections that need blurring before the user publishes.

## Module schema
See modules/aws-iam.json for a complete reference. Required: id, cloud, voice, model, title{kicker,title,lines}, intro, sections[]{id,section,url,kicker,cardTitle,bullets,narration, drill?}, recap{card,narration}.

## Quality bar (do not skip)
- 1920×1080, narration-driven pacing (each section held = its clip length).
- Valid, real console URLs and accurate security guidance.
- Title + recap cards; consistent overlay (top ribbon + bottom-left teaching card).
- Always surface the redaction list.

## Voice
Default voice `alloy`, model `gpt-4o-mini-tts`. To compare voices: `node sample-voices.mjs` pattern from the prototype, or set `voice` in the module JSON.

## Scaling a full course
A cloud course = many modules. Draft them as separate `modules/*.json`. To produce many, build them one at a time (each reuses the same saved auth). Suggested AWS set: iam, s3-security, vpc, ec2, kms, cloudtrail-config, guardduty, organizations-scp.
```

- [ ] **Step 3: Verify the skill is discoverable**

Run: `ls ~/.claude/skills/cloud-course-studio/SKILL.md`
Expected: path exists. (In a fresh Claude Code session the skill appears in the available-skills list.)

- [ ] **Step 4: Commit the toolkit reference to the skill**

```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && git add -A && git commit -m "docs: reference the cloud-course-studio skill" --allow-empty
```

---

## Task 8: README + end-to-end verification

**Files:**
- Create: `cloud-course-studio/README.md`

- [ ] **Step 1: Write README.md**

````markdown
# Cloud Course Studio

Narrated cloud-console training videos from one JSON file per module.

## Setup
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
````

- [ ] **Step 2: Run the full unit test suite**

Run: `cd /Users/kkmookhey/Projects/cloud-course-studio && npm test`
Expected: all tests pass (schema + mux).

- [ ] **Step 3: Confirm the IAM module reproduces end-to-end**

Confirm `out/aws-iam/aws-iam-narrated.mp4` exists, ~3–4 min, with audio. Spot-check by extracting frames:
```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && for t in 5 50 130; do ffmpeg -y -ss $t -i out/aws-iam/aws-iam-narrated.mp4 -frames:v 1 out/aws-iam/frame_${t}.png 2>/dev/null; done && ls out/aws-iam/frame_*.png
```
Expected: 3 PNGs; visually confirm title card, a console+overlay frame, and the trust-policy frame.

- [ ] **Step 4: Commit**

```bash
cd /Users/kkmookhey/Projects/cloud-course-studio && git add README.md && git commit -m "docs: README and end-to-end verification"
```

---

## Self-Review

**Spec coverage:**
- "Systematize first / IAM as reference" → Tasks 1–6 build the toolkit; Task 2 ports IAM; Tasks 3/5/6 reproduce IAM through the new system. ✓
- "Claude drafts from a brief" → encoded in the Skill workflow (Task 7, steps 1–3). ✓
- "Reuse one saved session per cloud" → Task 4 (`storageState`), consumed in Task 5 recorder; no login footage, no trim. ✓
- Consistent quality (overlays, pacing, redaction) → overlay/recorder (Task 5) + Skill quality bar (Task 7). ✓
- Multi-cloud readiness → `lib/clouds.mjs` has aws/azure/gcp profiles (Task 4). ✓

**Placeholder scan:** all code blocks are complete implementations; no TBD/"handle errors"/"similar to". ✓

**Type consistency:**
- `validateModule` required fields ↔ `aws-iam.json` keys ↔ recorder usage (`s.kicker`, `s.cardTitle`, `s.bullets`, `s.url`, `m.title.{kicker,title,lines}`, `m.recap.card.{kicker,title,accent,lines}`). ✓
- `segmentsOf` ids (`intro`, section ids, `drill.id`, `recap`) ↔ recorder `mark()` ids ↔ manifest ids ↔ mux offset lookup. ✓
- `paintFullCard({kicker,title,lines,accent})` ↔ called with `m.title` and recap card. ✓
- `paintOverlay({brand,subtitle,section,idx,total,kicker,title,bullets})` ↔ recorder + drill calls. ✓
- `buildMixFilter` output ↔ mux test expectation. ✓

**Note for executor:** Tasks 4 and 5 have one interactive step each (AWS login). Everything else is non-interactive. The two pure modules (schema, mux) are the only unit-tested units by design; browser/TTS/ffmpeg correctness is verified by reproducing the IAM module and inspecting output.
