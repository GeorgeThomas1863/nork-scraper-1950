import { chromium } from "playwright";
import os from "os";
import path from "path";

const profileDir = process.env.WATCH_PROFILE_PATH || path.join(os.homedir(), ".playwright-profiles", "kcnawatch");
const baseURL = process.env.WATCH_BASE_URL || "https://kcnawatch.org";

const context = await chromium.launchPersistentContext(profileDir, {
  channel: "chrome",
  headless: false,
  viewport: null,
  ignoreDefaultArgs: ["--enable-automation"],
  args: ["--disable-blink-features=AutomationControlled"],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(`${baseURL}/kctv-archive/`, { waitUntil: "domcontentloaded" });
console.log("Log in by hand, confirm /kctv-archive/ shows entries, then close the browser window.");

await new Promise((resolve) => context.on("close", resolve));
console.log("Profile saved to " + profileDir);
