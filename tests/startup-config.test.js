import { afterEach, describe, expect, it, vi } from "vitest";

const originalTokenArray = process.env.TOKEN_ARRAY;
const originalBotToken = process.env.STARTUP_TEST_BOT_TOKEN;
const originalApiScraper = process.env.API_SCRAPER;

afterEach(() => {
  vi.doUnmock("dotenv");
  vi.doUnmock("express");
  vi.doUnmock("../middleware/db-config.js");
  vi.resetModules();

  process.env.TOKEN_ARRAY = originalTokenArray;
  process.env.API_SCRAPER = originalApiScraper;

  if (originalBotToken) {
    process.env.STARTUP_TEST_BOT_TOKEN = originalBotToken;
  } else {
    delete process.env.STARTUP_TEST_BOT_TOKEN;
  }
});

describe("application startup", () => {
  it("loads environment configuration before Telegram modules evaluate", async () => {
    delete process.env.TOKEN_ARRAY;
    delete process.env.API_SCRAPER;

    const config = vi.fn(() => {
      process.env.TOKEN_ARRAY = "STARTUP_TEST_BOT_TOKEN";
      process.env.STARTUP_TEST_BOT_TOKEN = "startup-test-token";
      process.env.API_SCRAPER = "/api/startup-test";
    });
    const use = vi.fn();
    const listen = vi.fn();
    const post = vi.fn();
    const express = vi.fn(() => ({ use, listen }));
    express.urlencoded = vi.fn(() => "urlencoded-middleware");
    express.json = vi.fn(() => "json-middleware");
    express.Router = vi.fn(() => ({ post }));

    vi.doMock("dotenv", () => ({ default: { config } }));
    vi.doMock("express", () => ({ default: express }));
    vi.doMock("../middleware/db-config.js", () => ({
      dbConnect: vi.fn().mockResolvedValue(undefined),
    }));

    await expect(import("../app.js")).resolves.toBeDefined();

    expect(config).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith(
      "/api/startup-test",
      expect.any(Function),
    );
  });
});

describe("API_SCRAPER route configuration", () => {
  it.each([undefined, "", "api/scrape", "   "])(
    "rejects malformed value %s with a configuration error",
    async (apiScraper) => {
      vi.resetModules();

      if (apiScraper === undefined) {
        delete process.env.API_SCRAPER;
      } else {
        process.env.API_SCRAPER = apiScraper;
      }

      vi.doMock("../controllers/api-controller.js", () => ({
        apiEndpointController: vi.fn(),
      }));

      await expect(import("../routes/router.js")).rejects.toThrow(
        'Invalid API_SCRAPER configuration: expected a path starting with "/"',
      );
    },
  );
});
