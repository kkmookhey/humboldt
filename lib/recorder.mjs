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
      // Prefer the precise tab role (consoles render section labels as tabs);
      // fall back to any visible text match.
      const tab = page.getByRole("tab", { name: d.clickText });
      if (await tab.count()) await tab.first().click({ timeout: 6000 });
      else await page.getByText(d.clickText, { exact: false }).first().click({ timeout: 6000 });
      await page.waitForTimeout(1500);
    }
    await paintOverlay(page, {
      brand: "CLOUD COURSE", subtitle: s.section, section: d.section, idx: "•", total: String(total),
      kicker: d.kicker, title: d.cardTitle, bullets: d.bullets,
    });
    mark(d.id);
    await page.waitForTimeout(dwell(d.id));
  } catch (e) {
    // best-effort drill; skip if console layout differs — but don't fail silently
    console.warn(`⚠️  drill '${d.id}' skipped (console layout?): ${e.message} — its narration will be omitted`);
  }
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

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--window-size=1920,1080", "--window-position=0,0",
      // Keep the renderer running at full speed even when the window is
      // occluded/backgrounded — otherwise an unattended/detached build stalls
      // (page.evaluate hangs) and produces minutes of dead air.
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, storageState: state, recordVideo: { dir: vdir, size: VIEWPORT } });
    const page = await ctx.newPage();
    const t0 = Date.now();
    const offsets = {};
    const mark = (id) => { offsets[id] = (Date.now() - t0) / 1000; };
    const subtitle = m.title.title;
    const total = m.sections.length;

    await page.goto(prof.home, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    if (!prof.loggedIn(page.url())) {
      throw new Error(`Saved auth for ${m.cloud} looks stale. Re-run: node bin/login.mjs ${m.cloud}`);
    }

    await paintFullCard(page, { ...m.title, badge: m.examDomain });
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

    await paintFullCard(page, { kicker: m.recap.card.kicker, title: m.recap.card.title, accent: m.recap.card.accent, lines: m.recap.card.lines, note: m.recap.examTip });
    mark("recap");
    await page.waitForTimeout(dwell("recap"));

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
        mark(ex.id);
        await page.waitForTimeout(dwell(ex.id));
      }
    }

    const video = page.video();
    await ctx.close();
    const raw = await video.path();
    const silent = path.join(dir, "silent.mp4");
    // Trim the startup pre-roll (home load + login check) so the title card is
    // frame 1 — no bare console, no account name shown. The video and every
    // offset shift by the same amount, so audio/redaction stay aligned.
    const lead = Math.max(0, offsets.intro ?? 0);
    const trimmed = Object.fromEntries(Object.entries(offsets).map(([k, v]) => [k, Math.max(0, v - lead)]));
    execFileSync("ffmpeg", ["-y", "-i", raw, "-ss", String(lead), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: "inherit" });
    fs.rmSync(raw, { force: true });
    fs.writeFileSync(path.join(dir, "timing.json"), JSON.stringify({ offsets: trimmed }, null, 2));
    console.log("✅ Silent video →", silent);
    return { silent, offsets };
  } finally {
    await browser.close().catch(() => {});
  }
}
