import { describe, it, expect } from "vitest";
import { buildVidTitleText, buildVidCaptionText } from "../src/watch/vid-message.js";

describe("buildVidTitleText", () => {
  it("should return null for null input", () => {
    const result = buildVidTitleText(null);
    expect(result).toBeNull();
  });

  it("should return null when title is missing", () => {
    const result = buildVidTitleText({
      dateNormal: "09/27/2026",
      vidType: "news8pm",
      vidPageId: 123,
      urlNormal: "https://example.com",
    });
    expect(result).toBeNull();
  });

  it("should escape ampersand in title", () => {
    const inputObj = {
      title: "Test & Title",
      dateNormal: "09/27/2026",
      vidType: "news8pm",
      vidPageId: 123,
      urlNormal: "https://example.com",
    };
    const result = buildVidTitleText(inputObj);
    expect(result).toContain("<b>Test &amp; Title</b>");
  });

  it("should escape less-than in title", () => {
    const inputObj = {
      title: "Test < Title",
      dateNormal: "09/27/2026",
      vidType: "news8pm",
      vidPageId: 123,
      urlNormal: "https://example.com",
    };
    const result = buildVidTitleText(inputObj);
    expect(result).toContain("<b>Test &lt; Title</b>");
  });

  it("should escape greater-than in title", () => {
    const inputObj = {
      title: "Test > Title",
      dateNormal: "09/27/2026",
      vidType: "news8pm",
      vidPageId: 123,
      urlNormal: "https://example.com",
    };
    const result = buildVidTitleText(inputObj);
    expect(result).toContain("<b>Test &gt; Title</b>");
  });

  it("should escape ampersand in URL", () => {
    const inputObj = {
      title: "Test Title",
      dateNormal: "09/27/2026",
      vidType: "news8pm",
      vidPageId: 123,
      urlNormal: "https://example.com?a=1&b=2",
    };
    const result = buildVidTitleText(inputObj);
    expect(result).toContain("https://example.com?a=1&amp;b=2");
  });

  it("should escape special chars in date", () => {
    const inputObj = {
      title: "Test Title",
      dateNormal: "09/27/2026 < now",
      vidType: "news8pm",
      vidPageId: 123,
      urlNormal: "https://example.com",
    };
    const result = buildVidTitleText(inputObj);
    expect(result).toContain("09/27/2026 &lt; now");
  });

  it("should escape special chars in vidType", () => {
    const inputObj = {
      title: "Test Title",
      dateNormal: "09/27/2026",
      vidType: "news & more",
      vidPageId: 123,
      urlNormal: "https://example.com",
    };
    const result = buildVidTitleText(inputObj);
    expect(result).toContain("<b>KCTV VIDEO:</b> news &amp; more");
  });

  it("should include KCTV VIDEO info line with all fields", () => {
    const inputObj = {
      title: "Breaking News",
      dateNormal: "09/27/2026",
      vidType: "news8pm",
      vidPageId: 456,
      urlNormal: "https://example.com/video/456",
    };
    const result = buildVidTitleText(inputObj);
    expect(result).toContain("<b>KCTV VIDEO:</b> news8pm | <b>ID:</b> 456 | <b>DATE:</b> <i>09/27/2026</i>");
    expect(result).toContain("<i>https://example.com/video/456</i>");
  });

  it("should include header and separators", () => {
    const inputObj = {
      title: "Test",
      dateNormal: "09/27/2026",
      vidType: "news8pm",
      vidPageId: 123,
      urlNormal: "https://example.com",
    };
    const result = buildVidTitleText(inputObj);
    expect(result).toMatch(/🇰🇵 🇰🇵 🇰🇵/);
    expect(result).toMatch(/-----------------/);
  });
});

describe("buildVidCaptionText", () => {
  it("should return null for null input", () => {
    const result = buildVidCaptionText(null, 1, 1);
    expect(result).toBeNull();
  });

  it("should return null when title is missing", () => {
    const result = buildVidCaptionText(
      {
        dateNormal: "09/27/2026",
      },
      1,
      1
    );
    expect(result).toBeNull();
  });

  it("should format single part caption without Part suffix", () => {
    const inputObj = {
      title: "Test Video",
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj, 1, 1);
    expect(result).toBe("<b>Test Video</b>\n<i>09/27/2026</i>");
    expect(result).not.toContain("Part");
  });

  it("should omit Part suffix when partCount is undefined", () => {
    const inputObj = {
      title: "Test Video",
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj);
    expect(result).toBe("<b>Test Video</b>\n<i>09/27/2026</i>");
    expect(result).not.toContain("Part");
  });

  it("should format multi-part caption with Part suffix", () => {
    const inputObj = {
      title: "Test Video",
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj, 2, 3);
    expect(result).toBe("<b>Test Video</b>\n<i>09/27/2026</i> | Part 2 of 3");
  });

  it("should escape ampersand in title", () => {
    const inputObj = {
      title: "Test & Video",
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj, 1, 1);
    expect(result).toContain("Test &amp; Video");
  });

  it("should escape less-than in title", () => {
    const inputObj = {
      title: "Test < Video",
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj, 1, 1);
    expect(result).toContain("Test &lt; Video");
  });

  it("should escape greater-than in title", () => {
    const inputObj = {
      title: "Test > Video",
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj, 1, 1);
    expect(result).toContain("Test &gt; Video");
  });

  it("should escape special chars in date", () => {
    const inputObj = {
      title: "Test Video",
      dateNormal: "09/27/2026 < now",
    };
    const result = buildVidCaptionText(inputObj, 1, 1);
    expect(result).toContain("09/27/2026 &lt; now");
  });

  it("should truncate long title to keep total ≤ 1024 chars with parts", () => {
    const longTitle = "x".repeat(2000);
    const inputObj = {
      title: longTitle,
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj, 2, 3);
    expect(result.length).toBeLessThanOrEqual(1024);
    expect(result).toContain("| Part 2 of 3");
  });

  it("should truncate long title to keep total ≤ 1024 chars without parts", () => {
    const longTitle = "x".repeat(2000);
    const inputObj = {
      title: longTitle,
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj, 1, 1);
    expect(result.length).toBeLessThanOrEqual(1024);
    expect(result).not.toContain("Part");
  });

  it("should truncate and still include date", () => {
    const longTitle = "x".repeat(2000);
    const inputObj = {
      title: longTitle,
      dateNormal: "09/27/2026",
    };
    const result = buildVidCaptionText(inputObj, 1, 1);
    expect(result).toContain("<i>09/27/2026</i>");
  });
});
