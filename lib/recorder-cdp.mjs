// CDP recording for clouds whose auth can't be replayed (Azure/Entra). Attaches
// over CDP to a Chrome the user logged into, drives the portal, and captures one
// clean STILL per segment (overlay + spotlight baked in), then assembles a
// narrated slideshow where each still is held for exactly its narration length.
//
// Why stills, not screencast: the CDP screencast's frame-arrival timeline lags
// wall-clock under portal load, so audio (wall-clock) and video (frame arrival)
// drift apart. A slideshow built from known narration durations is perfectly in
// sync by construction, and static console blades look clean as stills.
//
// Launch the target Chrome first:
//   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
//     --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-az500-debug" \
//     --window-size=1920,1080 --window-position=0,0
// then sign in to the portal in that window.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { outDir } from "./config.mjs";
import { CLOUDS } from "./clouds.mjs";
import { paintOverlay, paintFullCard, paintSpotlight } from "./overlay.mjs";

const PAD = 1.0;
export const cdpUrl = () => process.env.CDP_URL || "http://localhost:9222";

// Wait until the page stops changing (two consecutive screenshots of the same
// byte size) — a loading spinner/skeleton keeps animating, a rendered blade is
// static. Robust + generic, no portal-specific selectors. Falls back at maxMs.
async function waitStable(page, { maxMs = 18000, interval = 1300 } = {}) {
  let prevLen = -1;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    // A static "Loading" skeleton is byte-stable and would fool the size check,
    // so also gate on no visible loading placeholder (chart-heavy blades like
    // Workload protections / Sentinel paint their data several seconds late).
    const loading = await page
      .locator("text=/^\\s*Loading\\b/i")
      .first()
      .isVisible()
      .catch(() => false);
    const buf = await page.screenshot({ type: "jpeg", quality: 40 }).catch(() => null);
    const len = buf ? buf.length : -1;
    if (!loading && len > 0 && len === prevLen) return; // rendered + stable two ticks
    prevLen = len;
    await page.waitForTimeout(interval);
  }
}

// Portal coach-marks / teaching bubbles (e.g. "New recommendations display",
// "Experiment with AI Assistant", feature tours) reappear on each fresh blade
// load and would otherwise land in a frame. Dismiss them by their exact button
// labels — these never collide with real read-only blade actions. Best-effort.
const COACHMARK_LABELS = ["Don't show again", "Dismiss", "Got it", "Got it!", "No thanks", "Maybe later", "Skip", "Skip tour"];
async function dismissCoachmarks(page) {
  for (const label of COACHMARK_LABELS) {
    try {
      const btn = page.getByRole("button", { name: label, exact: true });
      let guard = 0;
      while ((await btn.count()) && guard++ < 4) {
        await btn.first().click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(350);
      }
    } catch {}
  }
}

// Drive a section's drill (open a list row → optional tab), then paint the drill
// overlay. Caller captures the still. Best-effort: skips if the layout differs.
async function runDrill(page, s, total) {
  const d = s.drill;
  try {
    const link = page.locator("table a, [role='row'] a, [role='gridcell'] a").first();
    await link.waitFor({ state: "visible", timeout: 6000 });
    await link.click({ timeout: 4000 });
    await page.waitForTimeout(3500);
    if (d.clickText) {
      const tab = page.getByRole("tab", { name: d.clickText });
      if (await tab.count()) await tab.first().click({ timeout: 6000 });
      else await page.getByText(d.clickText, { exact: false }).first().click({ timeout: 6000 });
      await page.waitForTimeout(2500);
    }
    await paintOverlay(page, {
      brand: "CLOUD COURSE", subtitle: s.section, section: d.section, idx: "•", total: String(total),
      kicker: d.kicker, title: d.cardTitle, bullets: d.bullets,
    });
    if (d.focus) await paintSpotlight(page, d.focus);
    return true;
  } catch (e) {
    console.warn(`⚠️  drill '${d.id}' skipped (portal layout?): ${e.message} — its narration will be omitted`);
    return false;
  }
}

export async function recordModuleCDP(m, manifest) {
  const prof = CLOUDS[m.cloud];
  const dur = Object.fromEntries(manifest.map((x) => [x.id, x.durationSec]));
  const segDur = (id) => (dur[id] ?? 8) + PAD;

  const dir = outDir(m.id);
  const sdir = path.join(dir, "stills");
  fs.rmSync(sdir, { recursive: true, force: true });
  fs.mkdirSync(sdir, { recursive: true });

  let browser = null;
  const segs = []; // { id, file, dur }
  try {
    browser = await chromium.connectOverCDP(cdpUrl()).catch(() => null);
    if (!browser) {
      throw new Error(`Can't reach Chrome at ${cdpUrl()}. Launch Chrome with --remote-debugging-port=9222 (see lib/recorder-cdp.mjs header) and sign in to the portal first.`);
    }
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error("no browser context available over CDP");
    // CDP_REUSE_TAB: drive the user's already-authenticated tab instead of
    // opening a fresh one. Needed when the Chrome session has >1 signed-in
    // account (e.g. corp + personal): a new tab can't silently acquire a token
    // and MSAL errors with "timed_out", but the existing tab holds a live token
    // and navigates across blades cleanly. We never close a tab we didn't open.
    const reuseTab = process.env.CDP_REUSE_TAB === "1";
    let page, ownsPage = false;
    if (reuseTab) {
      page = ctx.pages().find((p) => p.url().includes("portal.azure.com")) || ctx.pages()[0];
      if (!page) throw new Error("CDP_REUSE_TAB=1 but no existing portal tab found — open the portal in the debug Chrome and sign in first.");
    } else {
      page = await ctx.newPage();
      ownsPage = true;
    }
    const client = await ctx.newCDPSession(page);
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    await page.goto(prof.home, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    if (!prof.loggedIn(page.url())) {
      throw new Error(`Not signed in to ${m.cloud} in the debug Chrome. Open ${prof.home} there, sign in, then retry.`);
    }
    // Warm the cold portal shell + first blade so section 1 renders fully.
    if (m.sections[0]?.url) {
      await page.goto(m.sections[0].url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(3000);
      await waitStable(page);
      await dismissCoachmarks(page);
    }

    let n = 0;
    const shoot = async (id) => {
      const file = path.join(sdir, `${String(n++).padStart(3, "0")}-${id}.png`);
      await page.screenshot({ path: file }).catch(() => {});
      if (fs.existsSync(file)) segs.push({ id, file, dur: segDur(id) });
    };

    const total = m.sections.length;
    const subtitle = m.title.title;

    await paintFullCard(page, { ...m.title, badge: m.examDomain });
    await page.waitForTimeout(700);
    await shoot("intro");

    for (let i = 0; i < m.sections.length; i++) {
      const s = m.sections[i];
      console.log(`>> [${i + 1}/${total}] ${s.section}`);
      await page.goto(s.url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(2000);
      await waitStable(page); // don't screenshot a still-loading blade
      await dismissCoachmarks(page); // clear feature tours before they hit a frame
      await page.waitForTimeout(600);
      await paintOverlay(page, {
        brand: "CLOUD COURSE", subtitle, section: s.section, idx: String(i + 1), total: String(total),
        kicker: s.kicker, title: s.cardTitle, bullets: s.bullets,
      });
      if (s.focus) await paintSpotlight(page, s.focus);
      await page.waitForTimeout(900);
      await shoot(s.id);
      if (s.drill) {
        if (await runDrill(page, s, total)) { await page.waitForTimeout(700); await shoot(s.drill.id); }
      }
    }

    await paintFullCard(page, { kicker: m.recap.card.kicker, title: m.recap.card.title, accent: m.recap.card.accent, lines: m.recap.card.lines, note: m.recap.examTip });
    await page.waitForTimeout(700);
    await shoot("recap");

    if (m.action) {
      const exs = m.action.exercises;
      for (let i = 0; i < exs.length; i++) {
        const ex = exs[i];
        console.log(`>> [lab ${i + 1}/${exs.length}] ${ex.title}`);
        await paintFullCard(page, {
          badge: `Hands-on lab · ${i + 1}/${exs.length}`,
          kicker: m.action.kicker || "Do this in your lab",
          title: ex.title, lines: ex.lines, accent: ex.accent || "#f0883e",
        });
        await page.waitForTimeout(700);
        await shoot(ex.id);
      }
    }

    if (ownsPage) await page.close().catch(() => {});

    if (segs.length < 2) throw new Error("no stills captured");

    // Slideshow: render each still as an EXACT-length clip, then concat. (The
    // concat-demuxer "duration" trick holds the final image past its time —
    // per-segment clips avoid that, so the body ends right on the last narration.)
    const offsets = {};
    let t = 0;
    const clips = [];
    for (const seg of segs) {
      offsets[seg.id] = +t.toFixed(3);
      const clip = path.join(sdir, `clip-${String(clips.length).padStart(3, "0")}.mp4`);
      execFileSync("ffmpeg", [
        "-y", "-loop", "1", "-t", seg.dur.toFixed(3), "-i", seg.file,
        "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=25,format=yuv420p",
        "-r", "25", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip,
      ], { stdio: "ignore" });
      clips.push(clip);
      t += seg.dur;
    }
    fs.writeFileSync(path.join(sdir, "clips.txt"), clips.map((c) => `file '${path.basename(c)}'`).join("\n"));
    const silent = path.join(dir, "silent.mp4");
    execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", "clips.txt", "-c", "copy", silent], { cwd: sdir, stdio: "inherit" });
    fs.writeFileSync(path.join(dir, "timing.json"), JSON.stringify({ offsets }, null, 2));
    fs.rmSync(sdir, { recursive: true, force: true });
    console.log("✅ Silent video (CDP stills) →", silent);
    return { silent, offsets };
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
}
