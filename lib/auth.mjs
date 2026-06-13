import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { authDir, VIEWPORT } from "./config.mjs";
import { CLOUDS } from "./clouds.mjs";

export const statePath = (cloud) => path.join(authDir(), `${cloud}.json`);
export const profileDir = (cloud) => path.join(authDir(), `${cloud}-profile`);

// Shared browser flags: window sizing + anti-throttle so the renderer keeps
// running at full speed even when occluded (otherwise detached builds stall).
export const BROWSER_ARGS = [
  "--window-size=1920,1080", "--window-position=0,0",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

// Is a usable saved session present for this cloud?
export function authPresent(cloud) {
  const prof = CLOUDS[cloud];
  if (prof?.cdp) return true; // verified at record time via the live CDP session
  if (prof?.persistent) {
    const d = profileDir(cloud);
    return fs.existsSync(d) && fs.readdirSync(d).length > 0;
  }
  return fs.existsSync(statePath(cloud));
}

async function waitForLogin(prof, page) {
  console.log(`\nLog in (with MFA) in the window. Waiting up to 5 minutes...`);
  const start = Date.now();
  while (Date.now() - start < 300000) {
    if (prof.loggedIn(page.url())) break;
    await page.waitForTimeout(2000);
  }
  return prof.loggedIn(page.url());
}

export async function loginAndSave(cloud) {
  const prof = CLOUDS[cloud];
  if (!prof) throw new Error(`unknown cloud '${cloud}' (known: ${Object.keys(CLOUDS).join(", ")})`);

  // CDP clouds (Azure/Entra) use a Chrome the user launches + signs into manually
  // — there is no saved session to capture. Print the launch command and return.
  if (prof.cdp) {
    console.log(`\n${cloud.toUpperCase()} records over CDP — launch Chrome with remote debugging, then sign in to ${prof.home} in that window:\n\n  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\\n    --remote-debugging-port=9222 --user-data-dir="$HOME/.chrome-${cloud}-debug" \\\n    --window-size=1920,1080 --window-position=0,0\n`);
    return;
  }

  fs.mkdirSync(authDir(), { recursive: true });

  // Persistent clouds (Azure/Entra) keep the whole browser profile on disk —
  // their auth spans multiple domains and sessionStorage that storageState drops.
  if (prof.persistent) {
    const dir = profileDir(cloud);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(dir, { headless: false, viewport: VIEWPORT, args: BROWSER_ARGS });
    try {
      const page = ctx.pages()[0] ?? await ctx.newPage();
      await page.goto(prof.home, { waitUntil: "domcontentloaded" }).catch(() => {});
      const ok = await waitForLogin(prof, page);
      await page.waitForTimeout(2000);
      if (!ok) throw new Error("login timed out");
    } finally {
      await ctx.close().catch(() => {}); // flushes the profile to disk
    }
    console.log("✅ Saved auth profile →", dir);
    return;
  }

  // storageState clouds (AWS): snapshot cookies + localStorage.
  const browser = await chromium.launch({ headless: false, args: BROWSER_ARGS });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    await page.goto(prof.home, { waitUntil: "domcontentloaded" }).catch(() => {});
    const ok = await waitForLogin(prof, page);
    if (!ok) throw new Error("login timed out");
    await page.waitForTimeout(2000);
    await ctx.storageState({ path: statePath(cloud) });
  } finally {
    await browser.close().catch(() => {});
  }
  console.log("✅ Saved auth state →", statePath(cloud));
}
