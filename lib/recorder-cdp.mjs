// CDP recording path — for clouds whose auth can't be replayed from a saved
// session (Azure/Entra MSA + corporate SSO). Instead of launching its own
// browser, it attaches over CDP to a Chrome the user has already logged into,
// drives the page, and captures via Chrome's screencast (Playwright's built-in
// recordVideo only works on a browser it launched). The user's Chrome is never
// closed — we only disconnect.
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
import { paintOverlay, paintFullCard } from "./overlay.mjs";

const PAD = 1.0;
export const cdpUrl = () => process.env.CDP_URL || "http://localhost:9222";

// Same drill behavior as the launched recorder, kept local so the two recorders
// stay independent (no circular import).
async function runDrill(page, s, total, dwell, mark) {
  const d = s.drill;
  try {
    const link = page.locator("table a, [role='row'] a").first();
    await link.waitFor({ state: "visible", timeout: 6000 });
    await link.click({ timeout: 4000 });
    await page.waitForTimeout(2500);
    if (d.clickText) {
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
    console.warn(`⚠️  drill '${d.id}' skipped (portal layout?): ${e.message} — its narration will be omitted`);
  }
}

export async function recordModuleCDP(m, manifest) {
  const prof = CLOUDS[m.cloud];
  const dur = Object.fromEntries(manifest.map((x) => [x.id, x.durationSec]));
  const dwell = (id) => Math.round(((dur[id] ?? 8) + PAD) * 1000);

  const dir = outDir(m.id);
  const fdir = path.join(dir, "frames");
  fs.rmSync(fdir, { recursive: true, force: true });
  fs.mkdirSync(fdir, { recursive: true });

  let browser = null;
  try {
    browser = await chromium.connectOverCDP(cdpUrl()).catch(() => null);
    if (!browser) {
      throw new Error(`Can't reach Chrome at ${cdpUrl()}. Launch Chrome with --remote-debugging-port=9222 (see lib/recorder-cdp.mjs header) and sign in to the portal first.`);
    }
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error("no browser context available over CDP");
    const page = await ctx.newPage();
    const client = await ctx.newCDPSession(page);
    // Force exact 1920x1080 rendering so screencast frames need no crop/bars.
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    // Auth pre-check before we start capturing.
    await page.goto(prof.home, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2500);
    if (!prof.loggedIn(page.url())) {
      throw new Error(`Not signed in to ${m.cloud} in the debug Chrome. Open ${prof.home} there, sign in, then retry.`);
    }

    // Screencast frames → disk, timestamped with node wall-clock so the assembled
    // video length matches the offsets timeline (both use Date.now).
    const frames = [];
    let capStart = null;
    client.on("Page.screencastFrame", async (f) => {
      const now = Date.now();
      if (capStart == null) capStart = now;
      const file = path.join(fdir, `${String(frames.length).padStart(5, "0")}.jpg`);
      try { fs.writeFileSync(file, Buffer.from(f.data, "base64")); frames.push({ t: (now - capStart) / 1000, file }); } catch {}
      try { await client.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch {}
    });
    await client.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

    const t0 = Date.now();
    const offsets = {};
    const mark = (id) => { offsets[id] = (Date.now() - t0) / 1000; };
    const subtitle = m.title.title;
    const total = m.sections.length;

    await paintFullCard(page, { ...m.title, badge: m.examDomain });
    mark("intro");
    await page.waitForTimeout(dwell("intro"));

    for (let i = 0; i < m.sections.length; i++) {
      const s = m.sections[i];
      console.log(`>> [${i + 1}/${total}] ${s.section} (${(dur[s.id] ?? 8).toFixed(1)}s)`);
      await page.goto(s.url, { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(4500); // Azure portal is a heavy SPA — give blades time to render
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

    await client.send("Page.stopScreencast").catch(() => {});
    await page.waitForTimeout(300);
    await page.close().catch(() => {});

    if (frames.length < 2) throw new Error("no screencast frames captured (is the tab visible/foreground?)");

    // Assemble frames at their wall-clock durations, normalize to 1920x1080@25.
    let list = "";
    for (let i = 0; i < frames.length; i++) {
      const d = i < frames.length - 1 ? frames[i + 1].t - frames[i].t : 0.1;
      list += `file '${path.basename(frames[i].file)}'\nduration ${Math.max(0.02, d).toFixed(3)}\n`;
    }
    list += `file '${path.basename(frames[frames.length - 1].file)}'\n`;
    fs.writeFileSync(path.join(fdir, "list.txt"), list);
    const raw = path.join(dir, "raw-screencast.mp4");
    execFileSync("ffmpeg", [
      "-y", "-f", "concat", "-safe", "0", "-i", "list.txt",
      "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p",
      "-r", "25", raw,
    ], { cwd: fdir, stdio: "inherit" });

    // Trim the startup pre-roll so the title card is frame 1 (same as the
    // launched recorder); shift every offset by the same amount.
    const silent = path.join(dir, "silent.mp4");
    const lead = Math.max(0, offsets.intro ?? 0);
    const trimmed = Object.fromEntries(Object.entries(offsets).map(([k, v]) => [k, Math.max(0, v - lead)]));
    execFileSync("ffmpeg", ["-y", "-i", raw, "-ss", String(lead), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", silent], { stdio: "inherit" });
    fs.rmSync(raw, { force: true });
    fs.rmSync(fdir, { recursive: true, force: true });
    fs.writeFileSync(path.join(dir, "timing.json"), JSON.stringify({ offsets: trimmed }, null, 2));
    console.log("✅ Silent video (CDP) →", silent);
    return { silent, offsets };
  } finally {
    // Disconnect the CDP client — this does NOT close the user's Chrome.
    try { if (browser) await browser.close(); } catch {}
  }
}
