import { describe, expect, it } from "vitest";
import { resolveListenHost } from "../../middleware/listen-host.js";

describe("resolveListenHost", () => {
  it.each([[undefined], [""]])("falls back to loopback for %s", (host) => {
    expect(resolveListenHost(host)).toBe("127.0.0.1");
  });

  it("returns the given host", () => {
    expect(resolveListenHost("0.0.0.0")).toBe("0.0.0.0");
  });
});
