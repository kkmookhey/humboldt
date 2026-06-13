// Orchestrate the full course build: for each module id given on argv, run the
// proven pipeline (build -> brand) and place the final in out/course-final/ with
// its numbered upload name. Continues past failures; logs progress; extracts a
// review frame per module so the whole batch can be eyeballed at the end.
//
//   node bin/build-course.mjs aws-inspector aws-detective ...
//
// Keep the recording Chromium window frontmost for the whole run.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT, outDir } from "../lib/config.mjs";

const NAME = {
  "aws-guardduty": "01-d1-guardduty",
  "aws-inspector": "02-d1-inspector",
  "aws-detective": "03-d1-detective",
  "aws-incident-response": "04-d1-incident-response",
  "aws-cloudtrail": "05-d2-cloudtrail",
  "aws-config": "06-d2-config",
  "aws-cloudwatch": "07-d2-cloudwatch",
  "aws-securityhub": "08-d2-securityhub",
  "aws-vpc-security": "09-d3-vpc-security",
  "aws-waf-shield": "10-d3-waf-shield",
  "aws-network-firewall": "11-d3-network-firewall",
  "aws-iam": "12-d4-iam",
  "aws-iam-identity-center": "13-d4-iam-identity-center",
  "aws-organizations-scp": "14-d4-organizations-scp",
  "aws-s3-security": "15-d5-s3-security",
  "aws-kms": "16-d5-kms",
  "aws-secrets-manager": "17-d5-secrets-manager",
  "aws-macie": "18-d5-macie",
  "aws-control-tower": "19-d6-control-tower",
  "aws-firewall-manager": "20-d6-firewall-manager",
};

const finalDir = path.join(ROOT, "out", "course-final");
const reviewDir = path.join(finalDir, "_review");
fs.mkdirSync(reviewDir, { recursive: true });
const logFile = path.join(reviewDir, "progress.log");
const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logFile, line + "\n");
};

const ids = process.argv.slice(2);
log(`=== batch start: ${ids.length} modules ===`);
const results = [];

for (const id of ids) {
  const num = NAME[id];
  if (!num) { log(`SKIP ${id} — no name mapping`); results.push({ id, ok: false, why: "no mapping" }); continue; }
  const t0 = Date.now();
  try {
    log(`▶ ${id} — building (TTS + record)…`);
    execFileSync("node", ["bin/build.mjs", id], { cwd: ROOT, stdio: "ignore" });
    log(`▶ ${id} — branding…`);
    execFileSync("node", ["bin/brand.mjs", id], { cwd: ROOT, stdio: "ignore" });
    const finalSrc = path.join(outDir(id), `${id}-final.mp4`);
    if (!fs.existsSync(finalSrc)) throw new Error("no -final.mp4 produced");
    const dest = path.join(finalDir, `${num}.mp4`);
    fs.copyFileSync(finalSrc, dest);
    // review frame at ~28s (first console section, past the intro sting)
    try {
      execFileSync("ffmpeg", ["-y", "-ss", "28", "-i", dest, "-frames:v", "1", path.join(reviewDir, `${num}.png`)], { stdio: "ignore" });
    } catch {}
    const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dest]).toString().trim();
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    log(`✅ ${id} → ${num}.mp4  (video ${(+dur).toFixed(0)}s, took ${secs}s)`);
    results.push({ id, ok: true, num, dur: +dur });
  } catch (e) {
    log(`❌ ${id} FAILED — ${e.message}`);
    results.push({ id, ok: false, why: e.message });
  }
}

log(`=== batch done: ${results.filter(r => r.ok).length}/${ids.length} ok ===`);
for (const r of results) log(`   ${r.ok ? "ok " : "FAIL"} ${r.id}${r.ok ? ` (${r.dur.toFixed(0)}s)` : ` — ${r.why}`}`);
fs.writeFileSync(path.join(reviewDir, "results.json"), JSON.stringify(results, null, 2));
