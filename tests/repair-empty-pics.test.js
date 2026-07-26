import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock db-config before importing the repair script (never connect live)
vi.mock("../middleware/db-config.js", () => {
  const mockCollection = {
    find: vi.fn(),
    updateMany: vi.fn(),
  };

  const mockDb = {
    collection: vi.fn(() => mockCollection),
  };

  return {
    dbGet: vi.fn(() => mockDb),
    dbConnect: vi.fn(),
    dbClose: vi.fn(),
  };
});

import { dbClose, dbConnect, dbGet } from "../middleware/db-config.js";
import {
  findEmptyPicDocs,
  parseRepairArgs,
  repairEmptyPicDocs,
  runRepair,
} from "../scripts/repair-empty-pics.js";

const getMockCollection = () => dbGet().collection();

let consoleSpy;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PICS_COLLECTION = "pics";

  dbConnect.mockResolvedValue(undefined);
  dbClose.mockResolvedValue(undefined);
  getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
  getMockCollection().updateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
});

const logText = () => consoleSpy.mock.calls.map((callArgs) => callArgs.join(" ")).join("\n");

// ---- parseRepairArgs ----

describe("parseRepairArgs", () => {
  it("defaults to dry run when no flags are passed", () => {
    expect(parseRepairArgs(["node", "scripts/repair-empty-pics.js"])).toBe(false);
  });

  it("returns true only for --execute", () => {
    expect(parseRepairArgs(["node", "scripts/repair-empty-pics.js", "--execute"])).toBe(true);
    expect(parseRepairArgs(["node", "scripts/repair-empty-pics.js", "--dry-run"])).toBe(false);
  });
});

// ---- findEmptyPicDocs ----

describe("findEmptyPicDocs", () => {
  it("queries the pics collection with { picSize: 0 }", async () => {
    const col = getMockCollection();
    col.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ picId: 1, url: "http://a.jpg" }]) });

    const result = await findEmptyPicDocs();

    expect(dbGet().collection).toHaveBeenCalledWith("pics");
    expect(col.find).toHaveBeenCalledWith({ picSize: 0 });
    expect(result).toEqual([{ picId: 1, url: "http://a.jpg" }]);
  });

  it("returns null when the query throws", async () => {
    const col = getMockCollection();
    col.find.mockImplementation(() => {
      throw new Error("mongo down");
    });

    const result = await findEmptyPicDocs();

    expect(result).toBeNull();
    expect(logText()).toContain("REPAIR ERROR");
  });
});

// ---- dry run mode ----

describe("runRepair dry run (default)", () => {
  it("counts and reports matching docs without calling updateMany", async () => {
    const col = getMockCollection();
    col.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { picId: 11, url: "http://kcna.kp/a.jpg", picName: "kcna_pic_11.jpg", headers: { a: 1 } },
        { picId: 12, url: "http://kcna.kp/b.jpg", picName: "kcna_pic_12.jpg", headers: { b: 2 } },
      ]),
    });

    const result = await runRepair({});

    expect(col.find).toHaveBeenCalledWith({ picSize: 0 });
    expect(col.updateMany).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.message).toContain("NOTHING WAS MODIFIED");
  });

  it("prints picId and url per doc and no full document dump", async () => {
    const col = getMockCollection();
    col.find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        { picId: 11, url: "http://kcna.kp/a.jpg", savePath: "/pics/kcna_pic_11.jpg", headers: { secret: "x" } },
      ]),
    });

    await runRepair({});

    const output = logText();
    expect(output).toContain("picId: 11");
    expect(output).toContain("http://kcna.kp/a.jpg");
    expect(output).not.toContain("savePath");
    expect(output).not.toContain("secret");
  });

  it("handles an empty result set", async () => {
    const result = await runRepair({});

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(getMockCollection().updateMany).not.toHaveBeenCalled();
  });

  it("closes the mongo connection via dbClose", async () => {
    await runRepair({});
    expect(dbClose).toHaveBeenCalledTimes(1);
  });
});

// ---- execute mode ----

describe("runRepair execute mode", () => {
  it("calls updateMany with the picSize filter and the four $unset fields", async () => {
    const col = getMockCollection();
    col.updateMany.mockResolvedValue({ matchedCount: 246, modifiedCount: 246 });

    const result = await runRepair({ execute: true });

    expect(col.updateMany).toHaveBeenCalledWith(
      { picSize: 0 },
      { $unset: { picSize: "", picName: "", savePath: "", headers: "" } }
    );
    expect(col.find).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.matchedCount).toBe(246);
    expect(result.modifiedCount).toBe(246);
    expect(result.message).toContain("matched 246");
  });

  it("closes the mongo connection via dbClose after updating", async () => {
    getMockCollection().updateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await runRepair({ execute: true });

    expect(dbClose).toHaveBeenCalledTimes(1);
  });
});

// ---- error paths ----

describe("runRepair error handling", () => {
  it("returns failure when updateMany throws, without an unhandled rejection", async () => {
    getMockCollection().updateMany.mockRejectedValue(new Error("write concern error"));

    const result = await repairEmptyPicDocs();

    expect(result.success).toBe(false);
    expect(result.message).toContain("REPAIR FAILED");
    expect(result.message).toContain("write concern error");
  });

  it("returns failure and still closes when the dry run query throws", async () => {
    getMockCollection().find.mockImplementation(() => {
      throw new Error("mongo down");
    });

    const result = await runRepair({});

    expect(result.success).toBe(false);
    expect(result.message).toContain("DRY RUN FAILED");
    expect(dbClose).toHaveBeenCalledTimes(1);
  });

  it("returns failure and still closes when updateMany throws in execute mode", async () => {
    getMockCollection().updateMany.mockRejectedValue(new Error("write concern error"));

    const result = await runRepair({ execute: true });

    expect(result.success).toBe(false);
    expect(result.message).toContain("REPAIR FAILED");
    expect(dbClose).toHaveBeenCalledTimes(1);
  });

  it("returns failure when dbConnect throws, never touching the collection or closing", async () => {
    dbConnect.mockRejectedValue(new Error("connection refused"));

    const result = await runRepair({ execute: true });

    expect(result.success).toBe(false);
    expect(result.message).toContain("could not connect");
    expect(getMockCollection().updateMany).not.toHaveBeenCalled();
    expect(dbClose).not.toHaveBeenCalled();
  });

  it("warns but still returns the result when dbClose itself throws", async () => {
    dbClose.mockRejectedValue(new Error("socket already gone"));

    const result = await runRepair({});

    expect(result.success).toBe(true);
    expect(logText()).toContain("REPAIR WARNING");
  });

  it("redacts connection strings out of error messages", async () => {
    dbConnect.mockRejectedValue(new Error("bad uri mongodb+srv://user:pw@cluster.example.net/db"));

    const result = await runRepair({});

    expect(result.message).not.toContain("user:pw");
    expect(result.message).toContain("[connection string redacted]");
  });

  it("returns failure when PICS_COLLECTION is not set", async () => {
    delete process.env.PICS_COLLECTION;

    const result = await repairEmptyPicDocs();

    expect(result.success).toBe(false);
    expect(getMockCollection().updateMany).not.toHaveBeenCalled();
  });
});
