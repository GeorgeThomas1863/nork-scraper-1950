import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Mock db-config and axios before importing the script (never connect to Mongo or KCNA)
vi.mock("../middleware/db-config.js", () => {
  const mockCollection = {
    find: vi.fn(),
    aggregate: vi.fn(),
    distinct: vi.fn(),
    countDocuments: vi.fn(),
    updateMany: vi.fn(),
    updateOne: vi.fn(),
    deleteMany: vi.fn(),
    insertOne: vi.fn(),
    createIndex: vi.fn(),
    dropIndex: vi.fn(),
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

vi.mock("axios", () => ({ default: vi.fn() }));

import axios from "axios";
import { dbClose, dbConnect, dbGet } from "../middleware/db-config.js";
import { archiveListHTML, emptyArchiveHTML } from "./fixtures/kcna-archive-list.js";
import {
  buildArticleIndex,
  buildCategoryPlan,
  buildCookieHeader,
  buildGroupKey,
  buildMergePlan,
  buildTypeUnion,
  chooseKeeperDoc,
  groupDuplicateDocs,
  isGroupTextIdentical,
  loadBackfillProgress,
  matchLinkItem,
  normalizeText,
  parseCsrfToken,
  parseLinkItems,
  parseMigrateArgs,
  parsePageCount,
  runBackfillPhase,
  runMergePhase,
  runMigration,
  saveBackfillProgress,
} from "../scripts/migrate-article-types.js";

const TOP_LIST_URL = "http://www.kcna.kp/en/article/list/6a47505ba5268fd7749c0fe11e4b24b4";
const NEW_URL_A = "http://www.kcna.kp/en/article/detail/aaaa1111bbbb2222cccc3333dddd4444";
const OLD_URL = (n) => `http://www.kcna.kp/en/article/q/${n}.kcmsf`;

const getMockCollection = () => dbGet().collection();

const mockFindResult = (docArray) => {
  getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(docArray) });
};

const buildDoc = (overrides) => ({
  _id: `id-${overrides.articleId}`,
  title: "Same Title",
  dateNormal: "09/08/2026",
  text: "Pyongyang, September 8 (KCNA) -- body text.",
  picArray: [],
  articleTypeArray: ["latest"],
  ...overrides,
});

let consoleSpy;
let outDir;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ARTICLES_COLLECTION = "articles";
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), "migrate-article-types-test-"));

  const col = getMockCollection();
  dbConnect.mockResolvedValue(undefined);
  dbClose.mockResolvedValue(undefined);
  mockFindResult([]);
  col.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
  col.distinct.mockResolvedValue([]);
  col.countDocuments.mockResolvedValue(0);
  col.updateMany.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });
  col.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
  col.deleteMany.mockResolvedValue({ deletedCount: 0 });
  col.createIndex.mockResolvedValue("articleTypeArray_1_date_-1_articleId_-1");
  col.dropIndex.mockResolvedValue({});

  consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
  fs.rmSync(outDir, { recursive: true, force: true });
});

const expectNoDbWrites = () => {
  const col = getMockCollection();
  expect(col.updateMany).not.toHaveBeenCalled();
  expect(col.updateOne).not.toHaveBeenCalled();
  expect(col.deleteMany).not.toHaveBeenCalled();
  expect(col.insertOne).not.toHaveBeenCalled();
  expect(col.createIndex).not.toHaveBeenCalled();
  expect(col.dropIndex).not.toHaveBeenCalled();
};

// ---- args ----

describe("parseMigrateArgs", () => {
  it("defaults to dry run with default out dir and delay", () => {
    const argObj = parseMigrateArgs(["node", "script", "seed"]);
    expect(argObj.execute).toBe(false);
    expect(argObj.outDir).toBe("/tmp/article-type-migration");
    expect(argObj.delayMs).toBe(2500);
  });

  it("parses all flags", () => {
    const argObj = parseMigrateArgs(["node", "script", "backfill", "--execute", "--out", "/x/y", "--category", "top", "--from-page", "4", "--delay-ms", "0"]);
    expect(argObj).toEqual({ phase: "backfill", execute: true, outDir: "/x/y", category: "top", fromPage: 4, delayMs: 0 });
  });

  it("rejects unknown phase, unknown category, missing flag value and --from-page without --category", () => {
    expect(parseMigrateArgs(["node", "script", "nuke"])).toBeNull();
    expect(parseMigrateArgs(["node", "script", "backfill", "--category", "commentary"])).toBeNull();
    expect(parseMigrateArgs(["node", "script", "backfill", "--out", "--execute"])).toBeNull();
    expect(parseMigrateArgs(["node", "script", "backfill", "--from-page", "3"])).toBeNull();
  });
});

// ---- grouping + text rule ----

describe("grouping key and text-identical rule", () => {
  it("normalizes whitespace and case into title|dateNormal", () => {
    expect(normalizeText("  a \n\t b  ")).toBe("a b");
    expect(buildGroupKey("  Kim Jong Un   INSPECTS\nFactory ", "09/08/2026")).toBe("kim jong un inspects factory|09/08/2026");
    expect(buildGroupKey("", "09/08/2026")).toBeNull();
    expect(buildGroupKey("Title", null)).toBeNull();
  });

  it("groups docs with the same normalized title and date", () => {
    const docArray = [buildDoc({ articleId: 1, title: "Same  Title" }), buildDoc({ articleId: 2, title: "same title " }), buildDoc({ articleId: 3, title: "Other" })];
    const groupArray = groupDuplicateDocs(docArray);
    expect(groupArray).toHaveLength(1);
    expect(groupArray[0].map((doc) => doc.articleId)).toEqual([1, 2]);
  });

  it("does NOT group the same title on different dates", () => {
    const docArray = [buildDoc({ articleId: 1, dateNormal: "09/08/2026" }), buildDoc({ articleId: 2, dateNormal: "09/09/2026" })];
    expect(groupDuplicateDocs(docArray)).toEqual([]);
  });

  it("treats text as identical only after whitespace normalization", () => {
    expect(isGroupTextIdentical([buildDoc({ articleId: 1, text: "a  b\nc" }), buildDoc({ articleId: 2, text: " a b c " })])).toBe(true);
    expect(isGroupTextIdentical([buildDoc({ articleId: 1, text: "a b c" }), buildDoc({ articleId: 2, text: "a b d" })])).toBe(false);
  });
});

// ---- keeper, union, pics ----

describe("keeper choice", () => {
  it("prefers the new-format URL even with a higher articleId", () => {
    const group = [buildDoc({ articleId: 5, url: OLD_URL(5) }), buildDoc({ articleId: 900, url: NEW_URL_A })];
    expect(chooseKeeperDoc(group).articleId).toBe(900);
  });

  it("uses the lowest articleId among several new-format URLs", () => {
    const group = [buildDoc({ articleId: 901, url: NEW_URL_A + "1" }), buildDoc({ articleId: 5, url: OLD_URL(5) }), buildDoc({ articleId: 900, url: NEW_URL_A })];
    expect(chooseKeeperDoc(group).articleId).toBe(900);
  });

  it("uses the lowest articleId when none are new-format", () => {
    const group = [buildDoc({ articleId: 7, url: OLD_URL(7) }), buildDoc({ articleId: 3, url: OLD_URL(3) })];
    expect(chooseKeeperDoc(group).articleId).toBe(3);
  });
});

describe("merge plan", () => {
  it("unions articleTypeArray and leftover articleType strings without duplicates", () => {
    const group = [
      buildDoc({ articleId: 1, articleTypeArray: ["latest", "top"] }),
      buildDoc({ articleId: 2, articleTypeArray: undefined, articleType: "home" }),
      buildDoc({ articleId: 3, articleTypeArray: ["top"], articleType: "top" }),
    ];
    expect(buildTypeUnion(group)).toEqual(["latest", "top", "home"]);
  });

  it("copies picArray to a keeper with no pics and records mergedFrom", () => {
    const picArray = [{ url: "http://www.kcna.kp/pic.jpg" }];
    const group = [buildDoc({ articleId: 10, url: NEW_URL_A, picArray: [] }), buildDoc({ articleId: 2, url: OLD_URL(2), picArray: picArray, articleTypeArray: ["top"] })];

    const planObj = buildMergePlan(group);

    expect(planObj.keeperDoc.articleId).toBe(10);
    expect(planObj.removeDocArray.map((doc) => doc.articleId)).toEqual([2]);
    expect(planObj.setObj.picArray).toEqual(picArray);
    expect(planObj.setObj.articleTypeArray).toEqual(["latest", "top"]);
    expect(planObj.setObj.mergedFrom).toEqual([{ url: OLD_URL(2), articleId: 2 }]);
  });

  it("does not overwrite a keeper that already has pics", () => {
    const group = [buildDoc({ articleId: 1, picArray: [{ url: "keep.jpg" }] }), buildDoc({ articleId: 2, picArray: [{ url: "other.jpg" }] })];
    expect(buildMergePlan(group).setObj.picArray).toBeUndefined();
  });
});

describe("runMergePhase", () => {
  const buildMergeFixture = () => [
    buildDoc({ articleId: 1, url: OLD_URL(1), articleTypeArray: ["latest"] }),
    buildDoc({ articleId: 2, url: NEW_URL_A, articleTypeArray: ["top"] }),
    buildDoc({ articleId: 3, url: OLD_URL(3), title: "Differs", text: "one" }),
    buildDoc({ articleId: 4, url: OLD_URL(4), title: "Differs", text: "two" }),
  ];

  it("dry run writes nothing to the DB and reports the skipped group", async () => {
    mockFindResult(buildMergeFixture());

    const result = await runMergePhase({ execute: false, outDir });

    expectNoDbWrites();
    expect(result.success).toBe(true);
    expect(result.message).toContain("mergeable 1");
    expect(result.message).toContain("skipped (text differs) 1");
    expect(result.message).toContain("WOULD DELETE 1");
    expect(fs.readdirSync(outDir).some((name) => name.startsWith("merge-preimage"))).toBe(false);
  });

  it("execute writes the preimage, updates the keeper, then deletes the extra doc", async () => {
    mockFindResult(buildMergeFixture());
    const col = getMockCollection();
    col.deleteMany.mockResolvedValue({ deletedCount: 1 });

    const result = await runMergePhase({ execute: true, outDir });

    expect(result.success).toBe(true);
    const preimageName = fs.readdirSync(outDir).find((name) => name.startsWith("merge-preimage"));
    const preimage = JSON.parse(fs.readFileSync(path.join(outDir, preimageName), "utf8"));
    expect(preimage.deleteDocArray).toHaveLength(1);
    expect(preimage.deleteDocArray[0].articleId).toEqual({ $numberInt: "1" });
    expect(col.updateOne).toHaveBeenCalledWith({ _id: "id-2" }, { $set: expect.objectContaining({ articleTypeArray: ["latest", "top"] }) });
    expect(col.deleteMany).toHaveBeenCalledWith({ _id: { $in: ["id-1"] } });
    expect(col.updateOne.mock.invocationCallOrder[0]).toBeLessThan(col.deleteMany.mock.invocationCallOrder[0]);
  });

  it("aborts without deleting when the preimage cannot be written", async () => {
    mockFindResult(buildMergeFixture());
    const blockedDir = path.join(outDir, "not-a-dir");
    fs.writeFileSync(blockedDir, "file");

    const result = await runMergePhase({ execute: true, outDir: blockedDir });

    expect(result.success).toBe(false);
    expect(result.message).toContain("NOTHING DELETED");
    expectNoDbWrites();
  });
});

// ---- dry run for seed/finalize via runMigration ----

describe("dry run writes nothing (seed, finalize)", () => {
  it("seed dry run counts but never updates or creates the index", async () => {
    const col = getMockCollection();
    col.distinct.mockResolvedValue(["latest", "top", null, ""]);
    col.countDocuments.mockResolvedValue(3);

    const result = await runMigration({ phase: "seed", execute: false, outDir });

    expect(result.success).toBe(true);
    expect(result.message).toContain("NOTHING WAS MODIFIED");
    expectNoDbWrites();
    expect(dbConnect).toHaveBeenCalledTimes(1);
    expect(dbClose).toHaveBeenCalledTimes(1);
  });

  it("seed execute runs one $addToSet updateMany per distinct type and creates the index", async () => {
    const col = getMockCollection();
    col.distinct.mockResolvedValue(["latest", "top"]);

    const result = await runMigration({ phase: "seed", execute: true, outDir });

    expect(result.success).toBe(true);
    expect(col.updateMany).toHaveBeenCalledWith({ articleType: "latest" }, { $addToSet: { articleTypeArray: "latest" } });
    expect(col.updateMany).toHaveBeenCalledWith({ articleType: "top" }, { $addToSet: { articleTypeArray: "top" } });
    expect(col.createIndex).toHaveBeenCalledWith({ articleTypeArray: 1, date: -1, articleId: -1 });
  });

  it("finalize dry run writes nothing", async () => {
    const result = await runMigration({ phase: "finalize", execute: false, outDir });
    expect(result.success).toBe(true);
    expectNoDbWrites();
  });

  it("finalize aborts when docs are missing articleTypeArray", async () => {
    mockFindResult([{ _id: "x", articleId: 1, url: OLD_URL(1), title: "t" }]);
    const result = await runMigration({ phase: "finalize", execute: true, outDir });
    expect(result.success).toBe(false);
    expectNoDbWrites();
  });

  it("finalize execute ignores an already-dropped index", async () => {
    const col = getMockCollection();
    col.dropIndex.mockRejectedValue(Object.assign(new Error("index not found with name"), { code: 27, codeName: "IndexNotFound" }));

    const result = await runMigration({ phase: "finalize", execute: true, outDir });

    expect(result.success).toBe(true);
    expect(col.updateMany).toHaveBeenCalledWith({ articleType: { $exists: true } }, { $unset: { articleType: "" } });
  });
});

// ---- archive page parsing ----

describe("archive page parsing", () => {
  it("parses page_cnt and _csrf from the fixture", () => {
    expect(parsePageCount(archiveListHTML)).toBe(36);
    expect(parseCsrfToken(archiveListHTML)).toBe("tok-123-abc");
    expect(parsePageCount(emptyArchiveHTML)).toBeNull();
    expect(parseCsrfToken(emptyArchiveHTML)).toBeNull();
  });

  it("builds a Cookie header from set-cookie values", () => {
    expect(buildCookieHeader({ "set-cookie": ["JSESSIONID=abc; Path=/; HttpOnly", "lang=en; Path=/"] })).toBe("JSESSIONID=abc; lang=en");
    expect(buildCookieHeader({})).toBeNull();
  });

  it("extracts absolute URL, normalized title and dateNormal per link", () => {
    const linkItemArray = parseLinkItems(archiveListHTML, TOP_LIST_URL);
    expect(linkItemArray).toHaveLength(2);
    expect(linkItemArray[0]).toEqual({ url: NEW_URL_A, title: "Kim Jong Un Inspects Factory", dateNormal: "09/08/2026" });
  });
});

// ---- title+date fallback ----

describe("matchLinkItem", () => {
  const docArray = [
    buildDoc({ articleId: 1, url: NEW_URL_A, title: "By Url" }),
    buildDoc({ articleId: 2, url: OLD_URL(2), title: "Old Story", dateNormal: "06/01/2026" }),
    buildDoc({ articleId: 3, url: OLD_URL(3), title: "Twice", dateNormal: "06/02/2026" }),
    buildDoc({ articleId: 4, url: OLD_URL(4), title: "Twice", dateNormal: "06/02/2026" }),
  ];
  const articleIndex = buildArticleIndex(docArray);

  it("matches by exact URL first", () => {
    const matchObj = matchLinkItem({ url: NEW_URL_A, title: "whatever", dateNormal: "01/01/2020" }, articleIndex);
    expect(matchObj.matchType).toBe("url");
    expect(matchObj.docArray[0].articleId).toBe(1);
  });

  it("falls back to title+date when exactly one doc matches", () => {
    const matchObj = matchLinkItem({ url: "http://www.kcna.kp/en/article/detail/zzz", title: "old  STORY", dateNormal: "06/01/2026" }, articleIndex);
    expect(matchObj.matchType).toBe("title");
    expect(matchObj.docArray[0].articleId).toBe(2);
  });

  it("reports ambiguous when several docs match and none when zero match", () => {
    expect(matchLinkItem({ url: "u1", title: "Twice", dateNormal: "06/02/2026" }, articleIndex).matchType).toBe("ambiguous");
    expect(matchLinkItem({ url: "u2", title: "Old Story", dateNormal: "06/05/2026" }, articleIndex).matchType).toBe("none");
  });
});

// ---- progress + backfill ----

describe("progress file resume", () => {
  const categoryArray = ["fatboy", "anecdote", "people", "latest", "top"];

  it("round-trips progress through the file", () => {
    const progressPath = path.join(outDir, "backfill-progress.json");
    expect(loadBackfillProgress(progressPath)).toBeNull();

    const saveResult = saveBackfillProgress(progressPath, { category: "top", lastCompletedPage: 4, pageCount: 36 });

    expect(saveResult.success).toBe(true);
    expect(loadBackfillProgress(progressPath)).toEqual({ category: "top", lastCompletedPage: 4, pageCount: 36 });
  });

  it("skips finished categories and resumes after the last completed page", () => {
    const planArray = buildCategoryPlan(categoryArray, { category: "people", lastCompletedPage: 4, pageCount: 10 }, null);
    expect(planArray).toEqual([
      { category: "people", startPage: 5 },
      { category: "latest", startPage: 1 },
      { category: "top", startPage: 1 },
    ]);
  });

  it("drops a category whose saved progress is complete, and --from-page overrides progress", () => {
    expect(buildCategoryPlan(["top"], { category: "top", lastCompletedPage: 36, pageCount: 36 }, null)).toEqual([]);
    expect(buildCategoryPlan(["top"], null, 7)).toEqual([{ category: "top", startPage: 7 }]);
  });
});

describe("runBackfillPhase", () => {
  const pageTwoHTML = archiveListHTML.replace("aaaa1111bbbb2222cccc3333dddd4444", "1111222233334444555566667777aaaa");

  const mockKcna = (postHtmlArray) => {
    axios.mockImplementation(async (config) => {
      if (config.method === "get") return { data: archiveListHTML.replace("page_cnt = 36", "page_cnt = 3"), headers: { "set-cookie": ["SESSION=s1; Path=/"] } };
      return { data: postHtmlArray.shift() ?? pageTwoHTML, headers: {} };
    });
  };

  const backfillDocArray = () => [
    buildDoc({ articleId: 1, url: NEW_URL_A, title: "Kim Jong Un Inspects Factory", articleTypeArray: ["latest"] }),
    buildDoc({ articleId: 2, url: OLD_URL(2), title: "Second Story", dateNormal: "09/09/2026", articleTypeArray: ["latest"] }),
  ];

  it("resumes from the saved progress, POSTs with cookie + _csrf, and never inserts", async () => {
    mockFindResult(backfillDocArray());
    mockKcna([pageTwoHTML, archiveListHTML.replace("Second Story", "Never Scraped")]);
    const progressPath = path.join(outDir, "backfill-progress-top.json");
    saveBackfillProgress(progressPath, { category: "top", lastCompletedPage: 1, pageCount: 3 });

    const result = await runBackfillPhase({ execute: true, outDir, category: "top", fromPage: null, delayMs: 0 });

    expect(result.success).toBe(true);
    const postCallArray = axios.mock.calls.filter((callArgs) => callArgs[0].method === "post");
    expect(postCallArray.map((callArgs) => callArgs[0].data)).toEqual([
      "_csrf=tok-123-abc&page_num=2&cnt_per_page=15&keyword=",
      "_csrf=tok-123-abc&page_num=3&cnt_per_page=15&keyword=",
    ]);
    expect(postCallArray[0][0].headers).toMatchObject({ Cookie: "SESSION=s1", Referer: TOP_LIST_URL });
    expect(postCallArray[0][0].timeout).toBe(60000);

    const col = getMockCollection();
    expect(col.updateOne).toHaveBeenCalledTimes(2);
    expect(col.updateOne).toHaveBeenCalledWith({ _id: "id-1" }, { $addToSet: { articleTypeArray: "top" } });
    expect(col.updateOne).toHaveBeenCalledWith({ _id: "id-2" }, { $addToSet: { articleTypeArray: "top" } });
    expect(col.insertOne).not.toHaveBeenCalled();
    expect(loadBackfillProgress(progressPath)).toEqual({ category: "top", lastCompletedPage: 3, pageCount: 3 });

    const report = JSON.parse(fs.readFileSync(path.join(outDir, "backfill-report-top.json"), "utf8"));
    expect(report.pagesDone).toBe(2);
    expect(report.matchedByTitle).toBe(2);
    expect(report.matchedByUrl).toBe(1);
    expect(report.typesAdded).toBe(2);
    expect(report.unmatchedArray).toEqual([{ url: NEW_URL_A.replace("aaaa1111bbbb2222cccc3333dddd4444", "eeee5555ffff6666aaaa7777bbbb8888"), title: "Never Scraped", dateNormal: "09/09/2026" }]);
  });

  it("dry run fetches but writes nothing to the DB and uses its own progress file", async () => {
    mockFindResult(backfillDocArray());
    mockKcna([]);

    const result = await runBackfillPhase({ execute: false, outDir, category: "top", fromPage: null, delayMs: 0 });

    expect(result.success).toBe(true);
    expectNoDbWrites();
    expect(fs.existsSync(path.join(outDir, "backfill-progress-top.json"))).toBe(false);
    expect(fs.existsSync(path.join(outDir, "backfill-progress-dry-run-top.json"))).toBe(true);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "backfill-report-top.json"), "utf8"));
    expect(report.typesAdded).toBe(2);
  });

  it("renews the session once on an empty page and records the page as failed if still empty", async () => {
    mockFindResult(backfillDocArray());
    mockKcna([emptyArchiveHTML, emptyArchiveHTML]);

    const result = await runBackfillPhase({ execute: false, outDir, category: "top", fromPage: 2, delayMs: 0 });

    expect(result.success).toBe(false);
    expect(result.message).toContain("1 FAILED PAGES");
    const getCallCount = axios.mock.calls.filter((callArgs) => callArgs[0].method === "get").length;
    expect(getCallCount).toBe(2);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "backfill-report-top.json"), "utf8"));
    expect(report.failedPageArray).toEqual([{ page: 2, reason: "no article links after session retry" }]);
    expect(report.pagesDone).toBe(1);
  });

  it("stops advancing progress at the first failed page", async () => {
    mockFindResult(backfillDocArray());
    mockKcna([emptyArchiveHTML, emptyArchiveHTML, pageTwoHTML]);

    const result = await runBackfillPhase({ execute: true, outDir, category: "top", fromPage: null, delayMs: 0 });

    expect(result.success).toBe(false);
    expect(loadBackfillProgress(path.join(outDir, "backfill-progress-top.json"))).toEqual({ category: "top", lastCompletedPage: 1, pageCount: 3 });
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "backfill-report-top.json"), "utf8"));
    expect(report.failedPageArray).toEqual([{ page: 2, reason: "no article links after session retry" }]);
    expect(report.pagesDone).toBe(2);
  });

  it("fails the page when a tag write fails and does not advance progress past it", async () => {
    mockFindResult(backfillDocArray());
    mockKcna([]);
    getMockCollection().updateOne.mockRejectedValueOnce(new Error("write failed"));

    const result = await runBackfillPhase({ execute: true, outDir, category: "top", fromPage: null, delayMs: 0 });

    expect(result.success).toBe(false);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, "backfill-report-top.json"), "utf8"));
    expect(report.failedPageArray).toHaveLength(1);
    expect(report.failedPageArray[0].page).toBe(1);
    expect(report.failedPageArray[0].reason).toContain("tag writes failed");
    expect(report.pagesDone).toBe(2);
    expect(fs.existsSync(path.join(outDir, "backfill-progress-top.json"))).toBe(false);
  });

  it("--from-page run writes no progress file", async () => {
    mockFindResult(backfillDocArray());
    mockKcna([]);

    const result = await runBackfillPhase({ execute: true, outDir, category: "top", fromPage: 2, delayMs: 0 });

    expect(result.success).toBe(true);
    const progressNameArray = fs.readdirSync(outDir).filter((name) => name.startsWith("backfill-progress"));
    expect(progressNameArray).toEqual([]);
  });

  it("--category run leaves the full-run progress file untouched", async () => {
    mockFindResult(backfillDocArray());
    mockKcna([]);
    const fullProgressPath = path.join(outDir, "backfill-progress.json");
    saveBackfillProgress(fullProgressPath, { category: "fatboy", lastCompletedPage: 2, pageCount: 10 });

    const result = await runBackfillPhase({ execute: true, outDir, category: "top", fromPage: null, delayMs: 0 });

    expect(result.success).toBe(true);
    expect(loadBackfillProgress(fullProgressPath)).toEqual({ category: "fatboy", lastCompletedPage: 2, pageCount: 10 });
    expect(loadBackfillProgress(path.join(outDir, "backfill-progress-top.json"))).toEqual({ category: "top", lastCompletedPage: 3, pageCount: 3 });
  });
});
