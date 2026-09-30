import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.WATCH_BASE_URL = "https://kcnawatch.org";
process.env.WATCH_PROFILE_PATH = "/tmp/test-kcnawatch-profile";
process.env.WATCH_HEADLESS = "true";

const { mockPage, mockContext, mockLaunchPersistentContext } = vi.hoisted(() => {
  const mockPage = {
    goto: vi.fn(),
    waitForSelector: vi.fn(),
    content: vi.fn(),
    url: vi.fn(),
    $: vi.fn(),
  };
  const mockContext = {
    pages: vi.fn(),
    newPage: vi.fn(),
    close: vi.fn(),
  };
  const mockLaunchPersistentContext = vi.fn();
  return { mockPage, mockContext, mockLaunchPersistentContext };
});

vi.mock("playwright", () => ({
  chromium: { launchPersistentContext: mockLaunchPersistentContext },
}));

import { parseKctvListing, scrapeKctvListing, isPlaceholderVidURL, WATCH_VID_TYPES } from "../src/watch/kctv-listing.js";
import {
  kctvListingHTML,
  kctvListingPlaceholderOnlyHTML,
  kctvListingEmptyHTML,
  kctvListingUppercaseThumbHTML,
  kctvListingQueryThumbHTML,
  kctvListingRelativeThumbHTML,
  kctvListingUnusableThumbsHTML,
  kctvListingPlaceholderThumbHTML,
} from "./fixtures/kctv-listing.js";

beforeEach(() => {
  vi.clearAllMocks();
  mockContext.pages.mockReturnValue([mockPage]);
  mockContext.newPage.mockResolvedValue(mockPage);
  mockContext.close.mockResolvedValue();
  mockPage.url.mockReturnValue("https://kcnawatch.org/kctv-archive/");
  mockPage.goto.mockResolvedValue();
  mockPage.waitForSelector.mockResolvedValue(true);
  mockPage.content.mockResolvedValue(kctvListingHTML);
  mockPage.$.mockResolvedValue(null);
  mockLaunchPersistentContext.mockResolvedValue(mockContext);
});

describe("WATCH_VID_TYPES", () => {
  it("only includes the news bulletin types", () => {
    expect(WATCH_VID_TYPES).toEqual(["news5pm", "news8pm"]);
  });
});

describe("parseKctvListing", () => {
  it("returns an empty, zero-candidate array when html is missing", () => {
    const entryArray = parseKctvListing(null, "https://kcnawatch.org");
    expect(entryArray).toHaveLength(0);
    expect(entryArray.candidateCount).toBe(0);
  });

  it("returns an empty, zero-candidate array when baseURL is missing", () => {
    const entryArray = parseKctvListing(kctvListingHTML, null);
    expect(entryArray).toHaveLength(0);
    expect(entryArray.candidateCount).toBe(0);
  });

  it("returns an empty, zero-candidate array when there are no entries in the html", () => {
    const entryArray = parseKctvListing(kctvListingEmptyHTML, "https://kcnawatch.org");
    expect(entryArray).toHaveLength(0);
    expect(entryArray.candidateCount).toBe(0);
  });

  it("parses all 3 entries with correct fields, skipping the decoy link", () => {
    const entryArray = parseKctvListing(kctvListingHTML, "https://kcnawatch.org");
    expect(entryArray.candidateCount).toBe(3);
    expect(entryArray).toHaveLength(3);

    for (const entry of entryArray) {
      expect(entry.site).toBe("watch");
      expect(typeof entry.title).toBe("string");
      expect(entry.date instanceof Date).toBe(true);
    }
  });

  it("derives the mp4 url from the .jpg thumbnail url", () => {
    const [fullEntry] = parseKctvListing(kctvListingHTML, "https://kcnawatch.org");
    expect(fullEntry.thumbURL.endsWith(".jpg")).toBe(true);
    expect(fullEntry.url).toBe(fullEntry.thumbURL.replace(/\.jpg$/, ".mp4"));
    expect(fullEntry.url.endsWith(".mp4")).toBe(true);
  });

  it("derives the mp4 url case-insensitively for an uppercase .JPG extension", () => {
    const [entry] = parseKctvListing(kctvListingUppercaseThumbHTML, "https://kcnawatch.org");
    expect(entry.url).toBe("https://streamer.nknews.org/tvarchive/stream-UPPER/stream-UPPER.mp4");
  });

  it("strips a query string before deriving the mp4 url", () => {
    const [entry] = parseKctvListing(kctvListingQueryThumbHTML, "https://kcnawatch.org");
    expect(entry.url).toBe("https://streamer.nknews.org/tvarchive/stream-QUERY/stream-QUERY-news5pm.mp4");
  });

  it("resolves a relative thumbnail src to an absolute mp4 url", () => {
    const [entry] = parseKctvListing(kctvListingRelativeThumbHTML, "https://kcnawatch.org");
    expect(entry.url).toBe("https://kcnawatch.org/tvarchive/stream-RELATIVE/stream-RELATIVE-news8pm.mp4");
  });

  it("drops entries with an unusable thumbnail extension while still reporting candidateCount", () => {
    const entryArray = parseKctvListing(kctvListingUnusableThumbsHTML, "https://kcnawatch.org");
    expect(entryArray.candidateCount).toBe(2);
    expect(entryArray).toHaveLength(0);
  });

  it("builds an absolute pageURL from the relative href", () => {
    const [fullEntry] = parseKctvListing(kctvListingHTML, "https://kcnawatch.org");
    expect(fullEntry.pageURL).toBe("https://kcnawatch.org/kctv-archive/6aa409684b9ac");
  });

  it("parses the date text into a UTC midnight Date", () => {
    const [fullEntry] = parseKctvListing(kctvListingHTML, "https://kcnawatch.org");
    expect(fullEntry.date.toISOString()).toBe("2026-09-11T00:00:00.000Z");
  });

  it("labels vidType from the broadcast-head text", () => {
    const entryArray = parseKctvListing(kctvListingHTML, "https://kcnawatch.org");
    const vidTypeArray = entryArray.map((entry) => entry.vidType);
    expect(vidTypeArray).toEqual(["full", "news5pm", "news8pm"]);
  });

  it("carries the label text through as title", () => {
    const entryArray = parseKctvListing(kctvListingHTML, "https://kcnawatch.org");
    const titleArray = entryArray.map((entry) => entry.title);
    expect(titleArray).toEqual(["Full Broadcast", "5pm Bulletin", "8pm Bulletin"]);
  });
});

describe("parseKctvListing - placeholder thumbnails", () => {
  it("drops an entry whose thumbnail is the image-uploading placeholder but keeps the healthy one", () => {
    const entryArray = parseKctvListing(kctvListingPlaceholderThumbHTML, "https://kcnawatch.org");
    expect(entryArray).toHaveLength(1);
    expect(entryArray[0].vidType).toBe("news8pm");
    for (const entry of entryArray) {
      expect(entry.url).not.toContain("image-uploading");
    }
  });

  it("yields no entries but counts every candidate and placeholder for a placeholder-only page", () => {
    const entryArray = parseKctvListing(kctvListingPlaceholderOnlyHTML, "https://kcnawatch.org");
    expect(entryArray).toHaveLength(0);
    expect(entryArray.candidateCount).toBe(2);
    expect(entryArray.placeholderCount).toBe(2);
  });

  it("still counts the dropped placeholder entry in candidateCount", () => {
    const entryArray = parseKctvListing(kctvListingPlaceholderThumbHTML, "https://kcnawatch.org");
    expect(entryArray.candidateCount).toBe(2);
  });
});

describe("isPlaceholderVidURL", () => {
  it("returns true for the image-uploading placeholder mp4 url", () => {
    expect(
      isPlaceholderVidURL("https://kcnawatch.org/wp-content/themes/kcnawatch/images/image-uploading.mp4")
    ).toBe(true);
  });

  it("returns false for a real streamer mp4 url", () => {
    expect(
      isPlaceholderVidURL("https://streamer.nknews.org/tvarchive/stream-1/stream-1-news5pm.mp4")
    ).toBe(false);
  });

  it("returns false for null, undefined and an empty string", () => {
    expect(isPlaceholderVidURL(null)).toBe(false);
    expect(isPlaceholderVidURL(undefined)).toBe(false);
    expect(isPlaceholderVidURL("")).toBe(false);
  });
});

describe("scrapeKctvListing - scrapeURL guard", () => {
  it("throws when howMuch is admin-scrape-url and scrapeURL is missing", async () => {
    await expect(scrapeKctvListing({ howMuch: "admin-scrape-url" })).rejects.toThrow(
      "KCTV scrape-url requires a scrapeURL"
    );
    expect(mockLaunchPersistentContext).not.toHaveBeenCalled();
  });

  it("throws when scrapeURL is a blank string", async () => {
    await expect(scrapeKctvListing({ howMuch: "admin-scrape-url", scrapeURL: "   " })).rejects.toThrow(
      "KCTV scrape-url requires a scrapeURL"
    );
  });

  it("throws when scrapeURL does not look like a url", async () => {
    await expect(scrapeKctvListing({ howMuch: "admin-scrape-url", scrapeURL: "not-a-url" })).rejects.toThrow(
      "KCTV scrape-url requires a scrapeURL"
    );
  });

  it("throws when scrapeURL merely starts with http but is not a url", async () => {
    await expect(scrapeKctvListing({ howMuch: "admin-scrape-url", scrapeURL: "httpnot-a-url" })).rejects.toThrow(
      "KCTV scrape-url requires a scrapeURL"
    );
    expect(mockLaunchPersistentContext).not.toHaveBeenCalled();
  });

  it("throws when scrapeURL uses a non-http protocol", async () => {
    await expect(scrapeKctvListing({ howMuch: "admin-scrape-url", scrapeURL: "ftp://kcnawatch.org/x" })).rejects.toThrow(
      "KCTV scrape-url requires a scrapeURL"
    );
  });

  it("proceeds when scrapeURL is a valid https url", async () => {
    const entryArray = await scrapeKctvListing({
      howMuch: "admin-scrape-url",
      scrapeURL: "https://kcnawatch.org/kctv-archive/some-id",
    });
    expect(entryArray).toHaveLength(2);
  });

  it("proceeds when scrapeURL is a valid http url", async () => {
    const entryArray = await scrapeKctvListing({
      howMuch: "admin-scrape-url",
      scrapeURL: "http://kcnawatch.org/kctv-archive/some-id",
    });
    expect(entryArray).toHaveLength(2);
  });
});

describe("scrapeKctvListing - admin-scrape-url login detection uses the popup check only", () => {
  it("does not treat a redirect away from /kctv-archive/ as not-logged-in", async () => {
    mockPage.url.mockReturnValue("https://kcnawatch.org/");

    const entryArray = await scrapeKctvListing({
      howMuch: "admin-scrape-url",
      scrapeURL: "https://kcnawatch.org/kctv-archive/some-id",
    });
    expect(entryArray).toHaveLength(2);
  });

  it("does not treat a free-member-form url as not-logged-in", async () => {
    mockPage.url.mockReturnValue("https://kcnawatch.org/free-member-form/");

    const entryArray = await scrapeKctvListing({
      howMuch: "admin-scrape-url",
      scrapeURL: "https://kcnawatch.org/kctv-archive/some-id",
    });
    expect(entryArray).toHaveLength(2);
  });

  it("throws not-logged-in when the selector times out and the popup is present", async () => {
    mockPage.waitForSelector.mockRejectedValue(new Error("timeout waiting for selector"));
    mockPage.$.mockResolvedValue({});

    await expect(
      scrapeKctvListing({ howMuch: "admin-scrape-url", scrapeURL: "https://kcnawatch.org/kctv-archive/some-id" })
    ).rejects.toThrow("KCTV listing not logged in - run the manual kcnawatch login into the browser profile first");
  });

  it("throws a layout-changed error when the selector times out with no popup present", async () => {
    mockPage.waitForSelector.mockRejectedValue(new Error("timeout waiting for selector"));
    mockPage.$.mockResolvedValue(null);

    await expect(
      scrapeKctvListing({ howMuch: "admin-scrape-url", scrapeURL: "https://kcnawatch.org/kctv-archive/some-id" })
    ).rejects.toThrow("KCTV listing entries not found - page layout may have changed");
  });
});

describe("scrapeKctvListing", () => {
  it("launches a persistent chrome context with the documented anti-bot recipe", async () => {
    await scrapeKctvListing({ howMuch: "admin-scrape-new" });

    expect(mockLaunchPersistentContext).toHaveBeenCalledWith("/tmp/test-kcnawatch-profile", {
      channel: "chrome",
      headless: true,
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled"],
    });
  });

  it("navigates to the archive listing page for admin-scrape-new", async () => {
    await scrapeKctvListing({ howMuch: "admin-scrape-new" });
    expect(mockPage.goto).toHaveBeenCalledWith("https://kcnawatch.org/kctv-archive/", { waitUntil: "domcontentloaded" });
  });

  it("navigates to the archive listing page for admin-scrape-all", async () => {
    await scrapeKctvListing({ howMuch: "admin-scrape-all" });
    expect(mockPage.goto).toHaveBeenCalledWith("https://kcnawatch.org/kctv-archive/", { waitUntil: "domcontentloaded" });
  });

  it("navigates to scrapeURL for admin-scrape-url", async () => {
    await scrapeKctvListing({ howMuch: "admin-scrape-url", scrapeURL: "https://kcnawatch.org/kctv-archive/some-id" });
    expect(mockPage.goto).toHaveBeenCalledWith("https://kcnawatch.org/kctv-archive/some-id", { waitUntil: "domcontentloaded" });
  });

  it("filters the parsed entries down to WATCH_VID_TYPES", async () => {
    const entryArray = await scrapeKctvListing({ howMuch: "admin-scrape-new" });
    expect(entryArray).toHaveLength(2);
    for (const entry of entryArray) {
      expect(WATCH_VID_TYPES).toContain(entry.vidType);
    }
  });

  it("closes the browser context after a successful scrape", async () => {
    await scrapeKctvListing({ howMuch: "admin-scrape-new" });
    expect(mockContext.close).toHaveBeenCalledTimes(1);
  });

  it("throws when the parsed candidate array is empty before filtering", async () => {
    mockPage.content.mockResolvedValue(kctvListingEmptyHTML);

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow(
      "KCTV listing produced zero candidates"
    );
  });

  it("closes the context even when zero candidates are found", async () => {
    mockPage.content.mockResolvedValue(kctvListingEmptyHTML);

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow();
    expect(mockContext.close).toHaveBeenCalledTimes(1);
  });

  it("throws a distinct error when entries are found but all thumbnails are unusable", async () => {
    mockPage.content.mockResolvedValue(kctvListingUnusableThumbsHTML);

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow(
      "KCTV listing entries had no usable thumbnails"
    );
  });

  it("resolves to an empty array when the page holds only placeholder entries", async () => {
    mockPage.content.mockResolvedValue(kctvListingPlaceholderOnlyHTML);

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).resolves.toEqual([]);
  });

  it("closes the context when all thumbnails are unusable", async () => {
    mockPage.content.mockResolvedValue(kctvListingUnusableThumbsHTML);

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow();
    expect(mockContext.close).toHaveBeenCalledTimes(1);
  });

  it("throws not-logged-in when redirected to the free-member-form page", async () => {
    mockPage.url.mockReturnValue("https://kcnawatch.org/free-member-form/?redirect=kctv-archive");

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow(
      "KCTV listing not logged in - run the manual kcnawatch login into the browser profile first"
    );
  });

  it("skips the selector wait entirely when already redirected to free-member-form", async () => {
    mockPage.url.mockReturnValue("https://kcnawatch.org/free-member-form/?redirect=kctv-archive");

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow();
    expect(mockPage.waitForSelector).not.toHaveBeenCalled();
  });

  it("throws not-logged-in when the archive page redirects away from /kctv-archive/ (e.g. the site root)", async () => {
    mockPage.url.mockReturnValue("https://kcnawatch.org/");

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow(
      "KCTV listing not logged in - run the manual kcnawatch login into the browser profile first"
    );
  });

  it("skips the selector wait entirely when redirected away from /kctv-archive/", async () => {
    mockPage.url.mockReturnValue("https://kcnawatch.org/");

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow();
    expect(mockPage.waitForSelector).not.toHaveBeenCalled();
  });

  it("throws not-logged-in when the selector times out and the free-member popup is present", async () => {
    mockPage.waitForSelector.mockRejectedValue(new Error("timeout waiting for selector"));
    mockPage.$.mockResolvedValue({});

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow(
      "KCTV listing not logged in - run the manual kcnawatch login into the browser profile first"
    );
  });

  it("throws a layout-changed error when the selector times out with no popup present", async () => {
    mockPage.waitForSelector.mockRejectedValue(new Error("timeout waiting for selector"));
    mockPage.$.mockResolvedValue(null);

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow(
      "KCTV listing entries not found - page layout may have changed"
    );
  });

  it("closes the context even when not logged in or the layout has changed", async () => {
    mockPage.waitForSelector.mockRejectedValue(new Error("timeout waiting for selector"));
    mockPage.$.mockResolvedValue(null);

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow();
    expect(mockContext.close).toHaveBeenCalledTimes(1);
  });

  it("closes the context when page.goto itself throws", async () => {
    mockPage.goto.mockRejectedValue(new Error("navigation failed"));

    await expect(scrapeKctvListing({ howMuch: "admin-scrape-new" })).rejects.toThrow("navigation failed");
    expect(mockContext.close).toHaveBeenCalledTimes(1);
  });
});
