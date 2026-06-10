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
