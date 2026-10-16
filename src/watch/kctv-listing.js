import { chromium } from "playwright";
import { JSDOM } from "jsdom";
import os from "os";
import path from "path";

export const WATCH_VID_TYPES = ["news5pm", "news8pm"];

const ENTRY_SELECTOR = "article.clearfix";
const ARCHIVE_PATH = "/kctv-archive/";
const NOT_LOGGED_IN_PATH = "free-member-form";
const FREE_MEMBER_POPUP_SELECTOR = ".nk-paywall-free-member-form, .free-member-form-inner";
const ENTRY_WAIT_TIMEOUT_MS = 20000;
const PLACEHOLDER_VID_MARKER = "image-uploading";
const DEBUG_STREAMER_HOST = "streamer.nknews.org";
const DEBUG_MAX_STREAMER_LOGS = 15;

export const scrapeKctvListing = async (inputParams) => {
  const { howMuch, scrapeURL } = inputParams ?? {};
  if (howMuch === "admin-scrape-url" && !isValidScrapeURL(scrapeURL)) {
    throw new Error("KCTV scrape-url requires a scrapeURL");
  }

  const baseURL = process.env.WATCH_BASE_URL || "https://kcnawatch.org";
  const listingURL = resolveKctvListingURL(howMuch, scrapeURL, baseURL);

  const html = await fetchKctvListingHTML(listingURL, howMuch);

  const entryArray = parseKctvListing(html, baseURL);
  if (!entryArray.candidateCount) throw new Error("KCTV listing produced zero candidates");
  if (!entryArray.length && !entryArray.placeholderCount) {
    throw new Error("KCTV listing entries had no usable thumbnails");
  }

  return filterKctvEntriesByType(entryArray);
};

const isValidScrapeURL = (scrapeURL) => {
  if (typeof scrapeURL !== "string") return false;

  try {
    const { protocol } = new URL(scrapeURL.trim());
    return protocol === "http:" || protocol === "https:";
  } catch (e) {
    return false;
  }
};

const resolveKctvListingURL = (howMuch, scrapeURL, baseURL) => {
  if (howMuch === "admin-scrape-url") return scrapeURL;
  return `${baseURL}/kctv-archive/`;
};

const fetchKctvListingHTML = async (listingURL, howMuch) => {
  const profileDir = resolveKctvProfileDir();
  const headless = process.env.WATCH_HEADLESS !== "false";

  let context = null;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      channel: "chrome",
      headless,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const page = context.pages()[0] ?? (await context.newPage());
    registerStreamerResponseLogger(page);
    const response = await page.goto(listingURL, { waitUntil: "domcontentloaded" });
    await ensureKctvLoggedIn(page, howMuch);

    return await resolveKctvListingHTML(page, response);
  } catch (e) {
    console.log("KCTV LISTING SCRAPE ERROR FOR URL: " + listingURL);
    console.log(e.message);
    throw e;
  } finally {
    if (context) await context.close();
  }
};

const resolveKctvListingHTML = async (page, response) => {
  const rawHTML = await readRawResponseText(response);

  if (rawHTML) {
    const debugDomHTML = await readDomContentForDebug(page);
    logListingDebug(response, page, rawHTML, debugDomHTML, "raw");
    return rawHTML;
  }

  const domHTML = await readDomContent(page);
  logListingDebug(response, page, rawHTML, domHTML, "dom-fallback");
  return domHTML;
};

const readRawResponseText = async (response) => {
  if (!response) return "";

  try {
    return (await response.text()) || "";
  } catch (error) {
    console.log("[KCTV DEBUG] KCTV LISTING RAW RESPONSE READ ERROR: " + error.message);
    return "";
  }
};

const readDomContent = async (page) => {
  try {
    return (await page.content()) || "";
  } catch (error) {
    console.log("KCTV LISTING page.content() READ ERROR: " + error.message);
    throw error;
  }
};

// [KCTV DEBUG] temporary helpers - delete together with their call sites
const registerStreamerResponseLogger = (page) => {
  let loggedCount = 0;

  page.on("response", (response) => {
    if (loggedCount >= DEBUG_MAX_STREAMER_LOGS) return;
    if (!response.url().includes(DEBUG_STREAMER_HOST)) return;

    loggedCount++;
    console.log(`[KCTV DEBUG] streamer response ${response.status()} ${response.url()}`);
  });
};

const readDomContentForDebug = async (page) => {
  try {
    return (await page.content()) || "";
  } catch (error) {
    console.log("[KCTV DEBUG] KCTV LISTING page.content() DEBUG READ ERROR (ignored): " + error.message);
    return null;
  }
};

const countPlaceholderMarkers = (html) => {
  if (!html) return 0;
  return html.split(PLACEHOLDER_VID_MARKER).length - 1;
};

const logListingDebug = (response, page, rawHTML, domHTML, source) => {
  if (source === "dom-fallback") {
    console.log("[KCTV DEBUG] raw response html unavailable, falling back to page.content()");
  }
  const status = response ? response.status() : "no-response";
  const finalURL = response ? response.url() : page.url();
  console.log(`[KCTV DEBUG] main response status=${status} url=${finalURL}`);
  console.log(
    `[KCTV DEBUG] image-uploading count raw=${countPlaceholderMarkers(rawHTML)} dom=${countPlaceholderMarkers(domHTML)}`
  );
  console.log(`[KCTV DEBUG] returning html source=${source}`);
};
// [KCTV DEBUG] end

const resolveKctvProfileDir = () => {
  return process.env.WATCH_PROFILE_PATH || path.join(os.homedir(), ".playwright-profiles", "kcnawatch");
};

const ensureKctvLoggedIn = async (page, howMuch) => {
  if (howMuch !== "admin-scrape-url" && isRedirectedAwayFromArchive(page)) {
    throw new Error("KCTV listing not logged in - run the manual kcnawatch login into the browser profile first");
  }

  try {
    await page.waitForSelector(ENTRY_SELECTOR, { timeout: ENTRY_WAIT_TIMEOUT_MS });
  } catch (error) {
    await throwIfBlockedByFreeMemberPopup(page);
    throw new Error("KCTV listing entries not found - page layout may have changed");
  }
};

const isRedirectedAwayFromArchive = (page) => {
  const currentURL = page.url();
  if (currentURL.includes(NOT_LOGGED_IN_PATH)) return true;

  return !currentURL.includes(ARCHIVE_PATH);
};

const throwIfBlockedByFreeMemberPopup = async (page) => {
  const popupElement = await page.$(FREE_MEMBER_POPUP_SELECTOR);
  if (!popupElement) return;

  throw new Error("KCTV listing not logged in - run the manual kcnawatch login into the browser profile first");
};

const filterKctvEntriesByType = (entryArray) => {
  const filteredArray = [];
  for (const entry of entryArray) {
    if (!WATCH_VID_TYPES.includes(entry.vidType)) continue;
    filteredArray.push(entry);
  }

  return filteredArray;
};

//+++++++++++++++++++++++++++++++++++++++++

export const parseKctvListing = (html, baseURL) => {
  const entryArray = [];
  entryArray.candidateCount = 0;
  entryArray.placeholderCount = 0;
  if (!html || !baseURL) return entryArray;

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const entryElementArray = document.querySelectorAll(ENTRY_SELECTOR);
  entryArray.candidateCount = entryElementArray.length;
  if (!entryElementArray.length) return entryArray;

  for (const entryElement of entryElementArray) {
    const entry = parseKctvEntryElement(entryElement, baseURL);
    if (!entry) {
      logKctvDroppedEntryDebug(entryElement, baseURL);
      continue;
    }

    if (isPlaceholderVidURL(entry.url)) {
      logKctvEntryDebug(entryElement, entry, "SKIP placeholder");
      console.log(`KCTV VID STILL UPLOADING, SKIPPING: ${entry.pageURL}`);
      entryArray.placeholderCount++;
      continue;
    }

    logKctvEntryDebug(entryElement, entry, "KEEP");
    entryArray.push(entry);
  }

  return entryArray;
};

// [KCTV DEBUG] temporary helper - delete together with its call sites
const logKctvEntryDebug = (entryElement, entry, decision) => {
  const dateText = entryElement.querySelector(".article-desc h4 a")?.textContent?.trim();
  console.log(
    `[KCTV DEBUG] entry date=${dateText} label=${entry.title} thumb=${entry.thumbURL} mp4=${entry.url} ${decision}`
  );
};

// [KCTV DEBUG] temporary helper - delete together with its call site
const logKctvDroppedEntryDebug = (entryElement, baseURL) => {
  const dateText = entryElement.querySelector(".article-desc h4 a")?.textContent?.trim();
  const label = entryElement.querySelector(".article-desc p.broadcast-head")?.textContent?.trim();
  const thumbURL = entryElement.querySelector(".article-thumb img")?.getAttribute("src");
  const mp4URL = thumbURL ? buildMp4URL(thumbURL, baseURL) : null;
  console.log(
    `[KCTV DEBUG] entry date=${dateText} label=${label} thumb=${thumbURL} mp4=${mp4URL} SKIP unparsed`
  );
};

const parseKctvEntryElement = (entryElement, baseURL) => {
  if (!entryElement || !baseURL) return null;

  const linkElement = entryElement.querySelector(".article-desc h4 a[href]");
  const imgElement = entryElement.querySelector(".article-thumb img[src]");
  const labelElement = entryElement.querySelector(".article-desc p.broadcast-head");
  if (!linkElement || !imgElement || !labelElement) return null;

  const href = linkElement.getAttribute("href");
  const thumbURL = imgElement.getAttribute("src");
  const dateText = linkElement.textContent?.trim();
  const title = labelElement.textContent?.trim();
  if (!href || !thumbURL || !dateText || !title) return null;

  if (thumbURL.includes("${")) return null;

  const pageURL = buildAbsoluteURL(href, baseURL);
  const url = buildMp4URL(thumbURL, baseURL);
  const date = parseKctvDate(dateText);
  const vidType = resolveKctvVidType(title, thumbURL);
  if (!pageURL || !url || !date || !vidType) return null;

  return { url, pageURL, thumbURL, date, vidType, title, site: "watch" };
};

const buildAbsoluteURL = (href, baseURL) => {
  if (!href || !baseURL) return null;

  try {
    return new URL(href, baseURL).href;
  } catch (error) {
    console.log(`INVALID KCTV URL: ${href}`);
    return null;
  }
};

const buildMp4URL = (thumbURL, baseURL) => {
  const absoluteThumbURL = buildAbsoluteURL(thumbURL, baseURL);
  if (!absoluteThumbURL) return null;

  const [pathPart] = absoluteThumbURL.split("?");
  const mp4URL = pathPart.replace(/\.jpg$/i, ".mp4");
  if (mp4URL === pathPart) return null;

  return mp4URL;
};

export const isPlaceholderVidURL = (url) => {
  if (!url) return false;
  return url.includes(PLACEHOLDER_VID_MARKER);
};

const MONTH_NAME_ARRAY = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const parseKctvDate = (dateText) => {
  if (!dateText) return null;

  const dateMatch = dateText.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!dateMatch) return null;

  const [, monthName, day, year] = dateMatch;
  const monthIndex = MONTH_NAME_ARRAY.indexOf(monthName);
  if (monthIndex === -1) return null;

  return new Date(Date.UTC(Number(year), monthIndex, Number(day)));
};

const KCTV_VID_TYPE_BY_LABEL = {
  "5pm bulletin": "news5pm",
  "8pm bulletin": "news8pm",
  "full broadcast": "full",
};

const resolveKctvVidType = (title, thumbURL) => {
  const labelType = KCTV_VID_TYPE_BY_LABEL[title?.toLowerCase()];
  if (labelType) return labelType;

  if (thumbURL?.includes("-news5pm")) return "news5pm";
  if (thumbURL?.includes("-news8pm")) return "news8pm";

  return null;
};
