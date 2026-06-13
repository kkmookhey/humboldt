// Build a 9:16 Instagram Reel on AWS IAM (Rohan/technical).
// Pipeline per beat: darkened B-roll bg (Pexels + real IAM console footage from
// out/aws-iam/silent.mp4 + Higgsfield datacenter clip) + a rendered code/policy
// card PNG + burned captions, paced to fresh TTS VO. Then concat + mux.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { ROOT, openaiKey } from "../lib/config.mjs";

const W = 1080, H = 1920, FPS = 30;
const SPEED = 1.2;   // reels need a fast pace — final pass speeds video + (pitch-preserved) audio
const dir = path.join(ROOT, "out", "reel-aws-iam");
const bgDir = path.join(dir, "bg");
const work = path.join(dir, "work");
for (const d of [dir, bgDir, work]) fs.mkdirSync(d, { recursive: true });

const SILENT = path.join(ROOT, "out", "aws-iam", "silent.mp4");          // real IAM console
const DATACENTER = path.join(ROOT, "assets", "higgsfield", "datacenter.mp4");

// Pexels portrait clips (1080x1920) — downloaded once.
const PEXELS = {
  hacker: "https://videos.pexels.com/video-files/5377775/5377775-hd_1080_1920_25fps.mp4",
  codeflow: "https://videos.pexels.com/video-files/5377697/5377697-hd_1080_1920_25fps.mp4",
  led: "https://videos.pexels.com/video-files/34578211/14652363_1080_1920_30fps.mp4",
};

async function ensurePexels() {
  for (const [name, url] of Object.entries(PEXELS)) {
    const out = path.join(bgDir, `${name}.mp4`);
    if (fs.existsSync(out) && fs.statSync(out).size > 0) continue;
    process.stdout.write(`↓ pexels ${name}… `);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`pexels ${name} ${res.status}`);
    fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    console.log("ok");
  }
}

// ---- colors ----
const C = { norm: "#c9d1d9", dim: "#6e7681", bad: "#ff7b72", good: "#56d364", warn: "#e3b341", accent: "#58a6ff" };
const tint = { bad: "rgba(248,81,73,0.14)", good: "rgba(46,160,67,0.14)", warn: "rgba(210,153,34,0.14)" };
const bar = { bad: "#ff7b72", good: "#3fb950", warn: "#d29922" };

// ---- beats ----
// bg: {src, ss} ; ss = input seek seconds (for the long console video)
const beats = [
  {
    id: "01-hook", bg: { src: path.join(bgDir, "hacker.mp4"), ss: 1 },
    headline: "This owns your\nentire AWS account", footer: "Not a hack — one IAM policy",
    code: [
      { t: "{", c: "dim" },
      { t: '  "Effect": "Allow",', c: "norm" },
      { t: '  "Action": "*",', c: "bad", hl: "bad" },
      { t: '  "Resource": "*"', c: "bad", hl: "bad" },
      { t: "}", c: "dim" },
    ],
    vo: "The most common way a company loses its entire AWS account isn't a zero-day. It's this. One line.",
  },
  {
    id: "02-setup", bg: { src: SILENT, ss: 205, dim: 0.62 },
    headline: '"*" means\neverything', footer: "Any action · any resource · no limits",
    code: [
      { t: '"Action": "*"', c: "bad", hl: "bad" },
      { t: "   → every API call", c: "dim" },
      { t: "", c: "dim" },
      { t: '"Resource": "*"', c: "bad", hl: "bad" },
      { t: "   → every resource", c: "dim" },
    ],
    vo: "It says: any action, on any resource, no limits. A master key to every S3 bucket, every database, every dollar of compute.",
  },
  {
    id: "03-leak", bg: { src: path.join(bgDir, "codeflow.mp4"), ss: 1 },
    headline: "Then the key\nleaks", footer: "Long-lived keys hit public repos in minutes",
    code: [
      { t: "AKIA3X...EXAMPLE", c: "bad", hl: "bad" },
      { t: "$ git push", c: "norm" },
      { t: "", c: "dim" },
      { t: "↳ scanned by bots", c: "warn" },
      { t: "  in minutes", c: "warn" },
    ],
    vo: "Now pair it with a long-lived access key. Those leak to public repos constantly. Bots scan new commits within minutes.",
  },
  {
    id: "04-leastpriv", bg: { src: SILENT, ss: 230, dim: 0.58 },
    headline: "Grant only\nwhat's used", footer: "Least privilege · scope to the ARN",
    code: [
      { t: '"Action": [', c: "norm" },
      { t: '  "s3:GetObject"', c: "good", hl: "good" },
      { t: "],", c: "norm" },
      { t: '"Resource":', c: "norm" },
      { t: '  "arn:…:my-bucket/*"', c: "good", hl: "good" },
    ],
    vo: "The fix is least privilege. Don't grant star. Grant the exact actions the app uses, scoped to one bucket. Nothing else.",
  },
  {
    id: "05-roles", bg: { src: SILENT, ss: 160, dim: 0.55 },
    headline: "Roles,\nnot keys", footer: "Temporary credentials — nothing to leak",
    code: [
      { t: '"Action":', c: "norm" },
      { t: '  "sts:AssumeRole"', c: "good", hl: "good" },
      { t: "", c: "dim" },
      { t: "creds expire in 1h", c: "good" },
    ],
    vo: "And stop handing out keys. Use a role. The credentials are temporary. They expire in an hour. Nothing to leak.",
  },
  {
    id: "06-cloudtrail", bg: { src: DATACENTER, ss: 0, dim: 0.30 },
    headline: "See every\nmove", footer: "CloudTrail logs every API call",
    code: [
      { t: "AssumeRole     ✓ logged", c: "norm" },
      { t: "GetObject      ✓ logged", c: "norm" },
      { t: "", c: "dim" },
      { t: "DeleteBucket   ⚠ logged", c: "warn", hl: "warn" },
    ],
    vo: "Turn on CloudTrail. Every assume-role, every API call, logged. If someone uses that asterisk, you'll see it.",
  },
  {
    id: "07-close", bg: { src: path.join(bgDir, "hacker.mp4"), ss: 6 },
    headline: "Go check your\npolicies. Today.", footer: 'Search your policies for  "*"  right now',
    code: [
      { t: "$ grep -rn '\"\\*\"'", c: "norm" },
      { t: "    policies/", c: "norm" },
      { t: "", c: "dim" },
      { t: "→ fix every match", c: "bad", hl: "bad" },
    ],
    vo: "Most AWS breaches aren't sophisticated. They're one asterisk nobody removed. Go check your policies. Today.",
  },
];

// ---- render card PNG (transparent margins; opaque code panel) ----
function cardHTML(b) {
  const mono = "'JetBrains Mono','SF Mono',Menlo,Consolas,monospace";
  const codeRows = b.code.map((l) => {
    const col = C[l.c] || C.norm;
    const hlCss = l.hl ? `background:${tint[l.hl]};border-left:6px solid ${bar[l.hl]};` : "border-left:6px solid transparent;";
    const txt = (l.t || "&nbsp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") || "&nbsp;";
    return `<div style="${hlCss}padding:6px 18px;color:${col};white-space:pre;border-radius:8px;">${txt || "&nbsp;"}</div>`;
  }).join("");
  const head = b.headline.replace(/</g, "&lt;").replace(/\n/g, "<br/>");
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;font-family:${mono};">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.15) 26%,rgba(0,0,0,0) 42%,rgba(0,0,0,0) 60%,rgba(0,0,0,0.30) 78%,rgba(0,0,0,0.82) 100%);"></div>
    <div style="position:absolute;top:150px;left:70px;right:70px;color:#fff;font-size:86px;font-weight:800;line-height:1.06;letter-spacing:-1px;text-shadow:0 6px 40px rgba(0,0,0,0.9);">${head}</div>
    <div style="position:absolute;top:760px;left:70px;right:70px;background:rgba(13,17,23,0.90);border:1px solid rgba(240,246,252,0.10);border-radius:30px;padding:46px 40px;font-size:46px;line-height:1.5;box-shadow:0 24px 80px rgba(0,0,0,0.55);">
      <div style="display:flex;gap:10px;margin-bottom:26px;"><span style="width:18px;height:18px;border-radius:50%;background:#ff5f57;"></span><span style="width:18px;height:18px;border-radius:50%;background:#febc2e;"></span><span style="width:18px;height:18px;border-radius:50%;background:#28c840;"></span></div>
      ${codeRows}
    </div>
    <div style="position:absolute;bottom:200px;left:70px;right:70px;color:${C.accent};font-size:48px;font-weight:600;letter-spacing:0.3px;text-shadow:0 4px 28px rgba(0,0,0,0.9);">▸ ${b.footer.replace(/</g, "&lt;")}</div>
  </body></html>`;
}

async function renderCards() {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    for (const b of beats) {
      await page.setContent(cardHTML(b), { waitUntil: "load" });
      await page.screenshot({ path: path.join(work, `${b.id}.png`), omitBackground: true });
    }
  } finally {
    await browser.close();
  }
}

// ---- TTS ----
async function speak(text, out) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts", voice: "alloy", response_format: "wav", input: text,
      instructions: "Energetic, confident cybersecurity expert talking to a peer. Punchy and direct, a touch urgent. Crisp pace, strong emphasis on key terms like 'asterisk', 'least privilege', 'role'. Natural, not robotic.",
    }),
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  fs.writeFileSync(out, Buffer.from(await res.arrayBuffer()));
}
const probe = (f) => parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

// ---- per-beat segment ----
function buildSegment(b, i) {
  const png = path.join(work, `${b.id}.png`);
  const voRaw = path.join(work, `${b.id}.raw.wav`);
  const vo = path.join(work, `${b.id}.vo.wav`);
  execFileSync("ffmpeg", ["-y", "-i", voRaw, "-ar", "48000", "-ac", "2", vo], { stdio: "ignore" });
  const d = probe(vo);
  const D = +(d + 0.5).toFixed(2);                  // tight tail; SPEED pass tightens further
  // padded audio: 150ms lead, pad to D
  const aud = path.join(work, `${b.id}.aud.wav`);
  execFileSync("ffmpeg", ["-y", "-i", vo, "-af", "adelay=150|150,apad", "-t", String(D), aud], { stdio: "ignore" });
  // video: bg cover+darken, overlay card
  const seg = path.join(work, `seg-${b.id}.mp4`);
  const dim = b.bg.dim ?? 0.25;                     // darkening; bright consoles need more
  const mul = (1 - dim).toFixed(2);                 // luma multiply (drawbox alpha is unreliable here)
  const filter =
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,` +
    `lutyuv=y='val*${mul}',eq=saturation=1.06,fps=${FPS}[bg];[bg][1:v]overlay=0:0,` +
    `fade=t=in:st=0:d=0.2,fade=t=out:st=${(D - 0.2).toFixed(2)}:d=0.2[v]`;
  execFileSync("ffmpeg", [
    "-y",
    "-stream_loop", "-1", "-ss", String(b.bg.ss), "-t", String(D), "-i", b.bg.src,
    "-i", png,
    "-i", aud,
    "-filter_complex", filter, "-map", "[v]", "-map", "2:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "192k",
    "-t", String(D), "-movflags", "+faststart", seg,
  ], { stdio: "ignore" });
  console.log(`  seg ${b.id}  vo=${d.toFixed(2)}s  seg=${D}s`);
  return { seg, D };
}

// ---- main ----
console.log("→ assets");
await ensurePexels();
console.log("→ cards");
await renderCards();
console.log("→ tts + segments");
let total = 0;
const segs = [];
for (let i = 0; i < beats.length; i++) {
  await speak(beats[i].vo, path.join(work, `${beats[i].id}.raw.wav`));
  const { seg, D } = buildSegment(beats[i], i);
  segs.push(seg); total += D;
}
// concat
const listFile = path.join(work, "concat.txt");
fs.writeFileSync(listFile, segs.map((s) => `file '${s}'`).join("\n"));
const raw = path.join(work, "reel-raw.mp4");
execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", raw], { stdio: "ignore" });
// Speed pass for faster reel pacing. Video (setpts) and audio (atempo, pitch-
// preserved) are sped in SEPARATE passes then muxed — combining them in one
// filter_complex leaves the audio at the wrong length (ffmpeg quirk).
const fv = path.join(work, "fast-v.mp4"), fa = path.join(work, "fast-a.m4a");
execFileSync("ffmpeg", ["-y", "-i", raw, "-filter:v", `setpts=PTS/${SPEED}`, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS), fv], { stdio: "ignore" });
execFileSync("ffmpeg", ["-y", "-i", raw, "-filter:a", `atempo=${SPEED}`, "-vn", "-c:a", "aac", "-b:a", "192k", fa], { stdio: "ignore" });
const final = path.join(dir, "aws-iam-reel.mp4");
execFileSync("ffmpeg", ["-y", "-i", fv, "-i", fa, "-c", "copy", "-movflags", "+faststart", final], { stdio: "inherit" });
console.log(`\n✅ Reel → ${final}  (~${(total / SPEED).toFixed(1)}s @ ${SPEED}x)`);
