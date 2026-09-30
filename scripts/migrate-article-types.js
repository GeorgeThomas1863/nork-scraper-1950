import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { BSON } from "mongodb";
import { fileURLToPath, pathToFileURL } from "url";

import { dbClose, dbConnect, dbGet } from "../middleware/db-config.js";
import { articleURLs } from "../src/util/define-things.js";
import { extractItemDate, normalizeDate } from "../src/util/util.js";

//one time migration: single string articleType -> articleTypeArray.
//phases (run in order): seed, merge, backfill, finalize. Dry run unless --execute.

const PHASE_ARRAY = ["seed", "merge", "backfill", "finalize"];
const VALUE_FLAG_ARRAY = ["--out", "--category", "--from-page", "--delay-ms"];
const DEFAULT_OUT_DIR = "/tmp/article-type-migration";
const DEFAULT_DELAY_MS = 2500;

const NEW_INDEX_SPEC = { articleTypeArray: 1, date: -1, articleId: -1 };
const OLD_INDEX_NAME = "articleType_1_date_-1_articleId_-1";
const MISSING_TYPE_ARRAY_FILTER = { $or: [{ articleTypeArray: { $exists: false } }, { articleTypeArray: { $size: 0 } }] };
const NEW_URL_MARKER = "/article/detail/";

const KCNA_REFERER = "http://www.kcna.kp/";
const LINK_SELECTOR = ".article a[href*='/article/detail/']";
const CNT_PER_PAGE = "15";
//KCNA connects slowly; undici's 10s connect default timed out in testing
const REQUEST_TIMEOUT_MS = 60000;
const RETRY_DELAY_ARRAY = [5000, 15000, 45000, 90000];

const USAGE_TEXT =
  "USAGE: node scripts/migrate-article-types.js <seed|merge|backfill|finalize> [--execute] [--out <dir>] [--category <type>] [--from-page N] [--delay-ms N]";

const buildCategoryArray = () => {
  const categoryArray = [];
  for (const typeKey in articleURLs) {
    categoryArray.push(typeKey.slice(0, -3));
  }
  return categoryArray;
};

const CATEGORY_ARRAY = buildCategoryArray();

const main = async () => {
  loadMigrateEnv();

  const argObj = parseMigrateArgs(process.argv);
  if (!argObj) {
    console.log(USAGE_TEXT);
    process.exit(1);
  }

  const result = await runMigration(argObj);

  console.log(result.message);
  process.exit(result.success ? 0 : 1);
};

//in the container env vars are already set; a .env is optional
export const loadMigrateEnv = () => {
  const scriptPath = fileURLToPath(import.meta.url);
  const envPath = path.resolve(path.dirname(scriptPath), "..", ".env");
  if (!fs.existsSync(envPath)) return false;

  dotenv.config({ path: envPath });
  return true;
};

export const parseMigrateArgs = (argvArray) => {
  if (!argvArray || argvArray.length < 3) return null;

  const phase = argvArray[2];
  if (!PHASE_ARRAY.includes(phase)) return null;
  if (hasMissingFlagValue(argvArray)) return null;

  const category = readFlagValue(argvArray, "--category");
  if (category && !CATEGORY_ARRAY.includes(category)) return null;

  const fromPageText = readFlagValue(argvArray, "--from-page");
  const fromPage = fromPageText ? parseWholeNumber(fromPageText, 1) : null;
  if (fromPageText && !fromPage) return null;
  if (fromPage && !category) return null;

  const delayText = readFlagValue(argvArray, "--delay-ms");
  const delayMs = delayText ? parseWholeNumber(delayText, 0) : DEFAULT_DELAY_MS;
  if (delayMs === null) return null;

  return {
    phase: phase,
    execute: argvArray.includes("--execute"),
    outDir: path.resolve(readFlagValue(argvArray, "--out") ?? DEFAULT_OUT_DIR),
    category: category,
    fromPage: fromPage,
    delayMs: delayMs,
  };
};

const hasMissingFlagValue = (argvArray) => {
  for (const flag of VALUE_FLAG_ARRAY) {
    const flagIndex = argvArray.indexOf(flag);
    if (flagIndex === -1) continue;

    const value = argvArray[flagIndex + 1];
    if (!value || value.startsWith("--")) return true;
  }
  return false;
};

const readFlagValue = (argvArray, flag) => {
  const flagIndex = argvArray.indexOf(flag);
  if (flagIndex === -1) return null;
  return argvArray[flagIndex + 1];
};

const parseWholeNumber = (text, minValue) => {
  if (!/^\d+$/.test(text)) return null;
  const value = parseInt(text, 10);
  if (value < minValue) return null;
  return value;
};

export const runMigration = async (argObj) => {
  if (!argObj) return { success: false, message: "MIGRATION FAILED: invalid arguments. " + USAGE_TEXT };
  if (!process.env.ARTICLES_COLLECTION) return { success: false, message: "MIGRATION FAILED: ARTICLES_COLLECTION env var not set" };

  const outResult = ensureOutDir(argObj.outDir);
  if (!outResult.success) return outResult;

  const connectResult = await connectMigrateDb();
  if (!connectResult.success) return connectResult;

  const modeText = argObj.execute ? "EXECUTE" : "DRY RUN (nothing will be written to the DB)";
  console.log(`MIGRATION PHASE: ${argObj.phase} | MODE: ${modeText} | OUT DIR: ${argObj.outDir}`);

  const result = await runPhase(argObj);
  await closeMigrateDb();

  return result;
};

const ensureOutDir = (outDir) => {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    return { success: true, message: `OUT DIR READY: ${outDir}` };
  } catch (e) {
    return { success: false, message: `MIGRATION FAILED: could not create out dir ${outDir}: ${e.message}` };
  }
};

const connectMigrateDb = async () => {
  try {
    await dbConnect();
    console.log(`MIGRATION TARGET: db ${process.env.DB_NAME} | collection ${process.env.ARTICLES_COLLECTION}`);
    return { success: true, message: "MIGRATION CONNECTED" };
  } catch (e) {
    return { success: false, message: "MIGRATION FAILED: could not connect to MongoDB: " + scrubSecrets(e.message) };
  }
};

const runPhase = async (argObj) => {
  if (argObj.phase === "seed") return runSeedPhase(argObj);
  if (argObj.phase === "merge") return runMergePhase(argObj);
  if (argObj.phase === "backfill") return runBackfillPhase(argObj);
  if (argObj.phase === "finalize") return runFinalizePhase(argObj);
  return { success: false, message: `MIGRATION FAILED: unknown phase ${argObj.phase}` };
};

const getArticleCollection = () => dbGet().collection(process.env.ARTICLES_COLLECTION);

//++++++++++++++++++++++++++++++++++
//SEED

export const runSeedPhase = async (argObj) => {
  const beforeCountMap = await countByField("$articleType", false);
  const seedTypeArray = await findSeedTypes();
  if (!beforeCountMap || !seedTypeArray) return { success: false, message: "SEED FAILED: could not read current articleType values" };

  printCountMap("SEED: articleType counts BEFORE", beforeCountMap);

  if (!argObj.execute) return runSeedDryRun(seedTypeArray);

  const seedResult = await seedTypeArrays(seedTypeArray);
  if (!seedResult.success) return seedResult;

  const indexResult = await createTypeArrayIndex();
  if (!indexResult.success) return indexResult;

  return reportSeedAfter();
};

//$unwind=true counts array elements, otherwise counts the raw field value
const countByField = async (fieldRef, unwind) => {
  const pipeline = [];
  if (unwind) pipeline.push({ $unwind: fieldRef });
  pipeline.push({ $group: { _id: fieldRef, count: { $sum: 1 } } });
  pipeline.push({ $sort: { count: -1 } });

  try {
    const countArray = await getArticleCollection().aggregate(pipeline).toArray();
    return buildCountMap(countArray);
  } catch (e) {
    console.log(`MIGRATION ERROR: count aggregate on ${fieldRef} failed: ` + scrubSecrets(e.message));
    return null;
  }
};

const buildCountMap = (countArray) => {
  if (!countArray) return null;
  const countMap = {};
  for (const countItem of countArray) {
    const key = countItem._id ?? "(none)";
    countMap[key] = countItem.count;
  }
  return countMap;
};

const findSeedTypes = async () => {
  try {
    const typeArray = await getArticleCollection().distinct("articleType");
    return buildSeedTypeArray(typeArray);
  } catch (e) {
    console.log("MIGRATION ERROR: distinct articleType failed: " + scrubSecrets(e.message));
    return null;
  }
};

const buildSeedTypeArray = (typeArray) => {
  if (!typeArray) return null;
  const seedTypeArray = [];
  for (const type of typeArray) {
    if (typeof type !== "string" || !type) continue;
    seedTypeArray.push(type);
  }
  return seedTypeArray;
};

const printCountMap = (label, countMap) => {
  console.log(label + ":");
  for (const key in countMap) {
    console.log(`  ${key}: ${countMap[key]}`);
  }
};

const runSeedDryRun = async (seedTypeArray) => {
  let wouldModifyTotal = 0;
  for (const type of seedTypeArray) {
    const wouldModify = await countDocs({ articleType: type, articleTypeArray: { $ne: type } });
    if (wouldModify === null) return { success: false, message: `SEED DRY RUN FAILED: count for type ${type} failed` };

    console.log(`  WOULD ADD "${type}" to articleTypeArray on ${wouldModify} docs`);
    wouldModifyTotal += wouldModify;
  }

  const missingAfter = await countDocs({ $and: [MISSING_TYPE_ARRAY_FILTER, { articleType: { $nin: seedTypeArray } }] });
  if (missingAfter === null) return { success: false, message: "SEED DRY RUN FAILED: missing count failed" };

  console.log(`  WOULD CREATE INDEX ${JSON.stringify(NEW_INDEX_SPEC)}`);
  console.log(`  DOCS THAT WOULD STILL BE MISSING articleTypeArray: ${missingAfter} (must be 0)`);

  return {
    success: true,
    message: `SEED DRY RUN COMPLETE: ${wouldModifyTotal} doc updates WOULD BE made; NOTHING WAS MODIFIED (re-run with --execute)`,
  };
};

const countDocs = async (filterObj) => {
  try {
    return await getArticleCollection().countDocuments(filterObj);
  } catch (e) {
    console.log(`MIGRATION ERROR: countDocuments ${JSON.stringify(filterObj)} failed: ` + scrubSecrets(e.message));
    return null;
  }
};

//one updateMany per distinct type so docs the new scraper already tagged keep their extra types
const seedTypeArrays = async (seedTypeArray) => {
  let modifiedTotal = 0;
  for (const type of seedTypeArray) {
    try {
      const updateData = await getArticleCollection().updateMany({ articleType: type }, { $addToSet: { articleTypeArray: type } });
      console.log(`  SEEDED "${type}": matched ${updateData.matchedCount} | modified ${updateData.modifiedCount}`);
      modifiedTotal += updateData.modifiedCount;
    } catch (e) {
      return { success: false, message: `SEED FAILED: updateMany for type ${type} errored: ` + scrubSecrets(e.message) };
    }
  }
  return { success: true, message: `SEEDED ${modifiedTotal} docs` };
};

const createTypeArrayIndex = async () => {
  try {
    const indexName = await getArticleCollection().createIndex(NEW_INDEX_SPEC);
    console.log(`  INDEX READY: ${indexName}`);
    return { success: true, message: `INDEX READY: ${indexName}` };
  } catch (e) {
    return { success: false, message: "SEED FAILED: createIndex errored: " + scrubSecrets(e.message) };
  }
};

const reportSeedAfter = async () => {
  const afterCountMap = await countByField("$articleTypeArray", true);
  const missingCount = await countDocs(MISSING_TYPE_ARRAY_FILTER);
  if (!afterCountMap || missingCount === null) return { success: false, message: "SEED FAILED: could not count results" };

  printCountMap("SEED: articleTypeArray element counts AFTER", afterCountMap);
  console.log(`  DOCS STILL MISSING articleTypeArray: ${missingCount} (must be 0)`);

  if (missingCount) return { success: false, message: `SEED INCOMPLETE: ${missingCount} docs still missing articleTypeArray` };
  return { success: true, message: "SEED COMPLETE: every article has articleTypeArray" };
};

//++++++++++++++++++++++++++++++++++
//MERGE

export const runMergePhase = async (argObj) => {
  const countBefore = await countDocs({});
  const docArray = await findAllArticleDocs();
  if (countBefore === null || !docArray) return { success: false, message: "MERGE FAILED: could not read articles" };

  const groupArray = groupDuplicateDocs(docArray);
  const splitObj = splitMergeGroups(groupArray);
  reportSkippedGroups(splitObj.skippedArray);

  const timestamp = buildFileTimestamp();
  writeJsonFile(path.join(argObj.outDir, `merge-plan-${timestamp}.json`), buildMergePlanReport(splitObj));

  const deleteTotal = countPlannedDeletes(splitObj.planArray);
  const summaryText = `groups found ${groupArray.length} | mergeable ${splitObj.planArray.length} | skipped (text differs) ${splitObj.skippedArray.length} | articles before ${countBefore}`;

  if (!argObj.execute) {
    return {
      success: true,
      message: `MERGE DRY RUN COMPLETE: ${summaryText} | WOULD DELETE ${deleteTotal} docs; NOTHING WAS MODIFIED (re-run with --execute)`,
    };
  }

  const preimagePath = path.join(argObj.outDir, `merge-preimage-${timestamp}.json`);
  const preimageResult = writeMergePreimage(preimagePath, splitObj.planArray);
  if (!preimageResult.success) return { success: false, message: "MERGE ABORTED, NOTHING DELETED: " + preimageResult.message };

  const applyObj = await applyMergePlans(splitObj.planArray);
  const countAfter = await countDocs({});

  return {
    success: applyObj.failedCount === 0,
    message: `MERGE COMPLETE: ${summaryText} | merged ${applyObj.mergedCount} | deleted ${applyObj.deletedCount} | failed ${applyObj.failedCount} | articles after ${countAfter} | preimage ${preimagePath}`,
  };
};

const findAllArticleDocs = async () => {
  try {
    return await getArticleCollection().find({}).toArray();
  } catch (e) {
    console.log("MIGRATION ERROR: find all articles failed: " + scrubSecrets(e.message));
    return null;
  }
};

export const groupDuplicateDocs = (docArray) => {
  if (!docArray) return null;

  const groupMap = new Map();
  for (const doc of docArray) {
    const groupKey = buildGroupKey(doc.title, doc.dateNormal);
    if (!groupKey) continue;
    if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
    groupMap.get(groupKey).push(doc);
  }

  const groupArray = [];
  for (const docGroup of groupMap.values()) {
    if (docGroup.length < 2) continue;
    groupArray.push(docGroup);
  }
  return groupArray;
};

//same title on a different date is a recurring headline, not a duplicate
export const buildGroupKey = (title, dateNormal) => {
  const normalTitle = normalizeText(title);
  if (!normalTitle || !dateNormal) return null;
  return normalTitle.toLowerCase() + "|" + dateNormal;
};

export const normalizeText = (text) => {
  if (typeof text !== "string") return "";
  return text.replace(/\s+/g, " ").trim();
};

const splitMergeGroups = (groupArray) => {
  const planArray = [];
  const skippedArray = [];
  for (const docGroup of groupArray) {
    if (!isGroupTextIdentical(docGroup)) {
      skippedArray.push(buildSkippedGroup(docGroup));
      continue;
    }
    planArray.push(buildMergePlan(docGroup));
  }
  return { planArray, skippedArray };
};

//docs with no text yet (incomplete scrape) do not block a merge; at least one doc must have text
export const isGroupTextIdentical = (docGroup) => {
  if (!docGroup || !docGroup.length) return false;

  let firstText = null;
  for (const doc of docGroup) {
    const normalText = normalizeText(doc.text);
    if (!normalText) continue;
    if (firstText === null) firstText = normalText;
    if (normalText !== firstText) return false;
  }
  return firstText !== null;
};

const buildSkippedGroup = (docGroup) => {
  const docInfoArray = [];
  for (const doc of docGroup) {
    docInfoArray.push({ articleId: doc.articleId, url: doc.url, textLength: normalizeText(doc.text).length });
  }
  return { title: docGroup[0].title, dateNormal: docGroup[0].dateNormal, docArray: docInfoArray };
};

export const buildMergePlan = (docGroup) => {
  const keeperDoc = chooseKeeperDoc(docGroup);
  if (!keeperDoc) return null;

  const removeDocArray = [];
  for (const doc of docGroup) {
    if (doc === keeperDoc) continue;
    removeDocArray.push(doc);
  }

  const setObj = buildKeeperSet(keeperDoc, docGroup, removeDocArray);
  return { keeperDoc, removeDocArray, setObj };
};

//new-format URL matches the live site, so future scrapes and the backfill find the keeper
export const chooseKeeperDoc = (docGroup) => {
  if (!docGroup || !docGroup.length) return null;

  const newFormatArray = [];
  for (const doc of docGroup) {
    if (typeof doc.url === "string" && doc.url.includes(NEW_URL_MARKER)) newFormatArray.push(doc);
  }

  const poolArray = newFormatArray.length ? newFormatArray : docGroup;
  return findLowestArticleIdDoc(poolArray);
};

const findLowestArticleIdDoc = (docArray) => {
  let lowestDoc = null;
  for (const doc of docArray) {
    const articleId = Number.isFinite(doc.articleId) ? doc.articleId : Infinity;
    const lowestId = lowestDoc && Number.isFinite(lowestDoc.articleId) ? lowestDoc.articleId : Infinity;
    if (!lowestDoc || articleId < lowestId) lowestDoc = doc;
  }
  return lowestDoc;
};

const buildKeeperSet = (keeperDoc, docGroup, removeDocArray) => {
  const setObj = {
    articleTypeArray: buildTypeUnion(docGroup),
    mergedFrom: buildMergedFromArray(keeperDoc, removeDocArray),
  };

  const donorPicArray = findDonorPicArray(keeperDoc, docGroup);
  if (donorPicArray) setObj.picArray = donorPicArray;

  const donorTitle = findDonorField(keeperDoc, docGroup, "title");
  if (donorTitle) setObj.title = donorTitle;

  const donorText = findDonorField(keeperDoc, docGroup, "text");
  if (donorText) setObj.text = donorText;

  return setObj;
};

//includes a leftover articleType string in case merge runs on a doc seed has not reached
export const buildTypeUnion = (docGroup) => {
  const typeArray = [];
  if (!docGroup) return typeArray;

  for (const doc of docGroup) {
    const docTypeArray = Array.isArray(doc.articleTypeArray) ? [...doc.articleTypeArray] : [];
    if (typeof doc.articleType === "string" && doc.articleType) docTypeArray.push(doc.articleType);
    addUniqueItems(typeArray, docTypeArray);
  }
  return typeArray;
};

const addUniqueItems = (targetArray, itemArray) => {
  for (const item of itemArray) {
    if (!targetArray.includes(item)) targetArray.push(item);
  }
};

//keeps entries from an earlier partial run so a re-run does not lose them
const buildMergedFromArray = (keeperDoc, removeDocArray) => {
  const mergedFromArray = Array.isArray(keeperDoc.mergedFrom) ? [...keeperDoc.mergedFrom] : [];
  const seenUrlArray = [];
  for (const mergedItem of mergedFromArray) seenUrlArray.push(mergedItem.url);

  for (const doc of removeDocArray) {
    if (seenUrlArray.includes(doc.url)) continue;
    mergedFromArray.push({ url: doc.url, articleId: doc.articleId });
    seenUrlArray.push(doc.url);
  }
  return mergedFromArray;
};

export const findDonorPicArray = (keeperDoc, docGroup) => {
  if (Array.isArray(keeperDoc.picArray) && keeperDoc.picArray.length) return null;

  for (const doc of docGroup) {
    if (doc === keeperDoc) continue;
    if (Array.isArray(doc.picArray) && doc.picArray.length) return doc.picArray;
  }
  return null;
};

const findDonorField = (keeperDoc, docGroup, fieldKey) => {
  if (normalizeText(keeperDoc[fieldKey])) return null;

  for (const doc of docGroup) {
    if (doc === keeperDoc) continue;
    if (normalizeText(doc[fieldKey])) return doc[fieldKey];
  }
  return null;
};

const reportSkippedGroups = (skippedArray) => {
  console.log(`MERGE: ${skippedArray.length} groups SKIPPED because text differs (decide by hand):`);
  for (const skippedGroup of skippedArray) {
    console.log(`  "${skippedGroup.title}" | ${skippedGroup.dateNormal}`);
    for (const docInfo of skippedGroup.docArray) {
      console.log(`    articleId ${docInfo.articleId} | text length ${docInfo.textLength} | ${docInfo.url}`);
    }
  }
};

const buildFileTimestamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const buildMergePlanReport = (splitObj) => {
  const groupReportArray = [];
  for (const planObj of splitObj.planArray) {
    const removeArray = [];
    for (const doc of planObj.removeDocArray) removeArray.push({ articleId: doc.articleId, url: doc.url });

    groupReportArray.push({
      title: planObj.keeperDoc.title,
      dateNormal: planObj.keeperDoc.dateNormal,
      keeper: { articleId: planObj.keeperDoc.articleId, url: planObj.keeperDoc.url },
      remove: removeArray,
      set: { articleTypeArray: planObj.setObj.articleTypeArray, copiesPicArray: Boolean(planObj.setObj.picArray) },
    });
  }
  return { mergeGroupArray: groupReportArray, skippedGroupArray: splitObj.skippedArray };
};

const writeJsonFile = (filePath, dataObj) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(dataObj, null, 2));
    console.log(`WROTE: ${filePath}`);
    return { success: true, message: `WROTE: ${filePath}` };
  } catch (e) {
    console.log(`MIGRATION ERROR: could not write ${filePath}: ${e.message}`);
    return { success: false, message: `could not write ${filePath}: ${e.message}` };
  }
};

const countPlannedDeletes = (planArray) => {
  let deleteTotal = 0;
  for (const planObj of planArray) deleteTotal += planObj.removeDocArray.length;
  return deleteTotal;
};

//canonical EJSON keeps ObjectId/Date types so the file can be restored with mongoimport
const writeMergePreimage = (filePath, planArray) => {
  const keeperDocArray = [];
  const deleteDocArray = [];
  for (const planObj of planArray) {
    keeperDocArray.push(planObj.keeperDoc);
    deleteDocArray.push(...planObj.removeDocArray);
  }

  try {
    const preimageText = BSON.EJSON.stringify({ keeperDocArray, deleteDocArray }, { relaxed: false });
    fs.writeFileSync(filePath, preimageText);
    console.log(`WROTE PREIMAGE: ${filePath} (${keeperDocArray.length} keepers, ${deleteDocArray.length} docs to delete)`);
    return { success: true, message: `WROTE PREIMAGE: ${filePath}` };
  } catch (e) {
    return { success: false, message: `could not write preimage ${filePath}: ${e.message}` };
  }
};

const applyMergePlans = async (planArray) => {
  const applyObj = { mergedCount: 0, deletedCount: 0, failedCount: 0 };
  for (const planObj of planArray) {
    const mergeResult = await applyMergePlan(planObj);
    if (!mergeResult.success) {
      console.log(mergeResult.message);
      applyObj.failedCount++;
      continue;
    }
    applyObj.mergedCount++;
    applyObj.deletedCount += mergeResult.deletedCount;
  }
  return applyObj;
};

//keeper is updated first; its extra docs are only deleted once the union is saved
const applyMergePlan = async (planObj) => {
  const { keeperDoc, removeDocArray, setObj } = planObj;
  const contextText = `keeper articleId ${keeperDoc.articleId} | ${keeperDoc.url}`;

  try {
    await getArticleCollection().updateOne({ _id: keeperDoc._id }, { $set: setObj });
  } catch (e) {
    return { success: false, message: `MERGE ERROR: keeper update failed, nothing deleted (${contextText}): ` + scrubSecrets(e.message) };
  }

  const removeIdArray = [];
  for (const doc of removeDocArray) removeIdArray.push(doc._id);

  try {
    const deleteData = await getArticleCollection().deleteMany({ _id: { $in: removeIdArray } });
    return { success: true, message: `MERGED ${contextText}`, deletedCount: deleteData.deletedCount };
  } catch (e) {
    return { success: false, message: `MERGE ERROR: delete failed after keeper update (${contextText}): ` + scrubSecrets(e.message) };
  }
};

//++++++++++++++++++++++++++++++++++
//BACKFILL

export const runBackfillPhase = async (argObj) => {
  const categoryArray = argObj.category ? [argObj.category] : CATEGORY_ARRAY;
  const progressPath = buildProgressPath(argObj);
  console.log(`BACKFILL PROGRESS FILE: ${progressPath ?? "none (--from-page run)"}`);
  const progressObj = loadBackfillProgress(progressPath);
  if (progressObj) console.log(`BACKFILL: resuming from ${progressPath}: ${JSON.stringify(progressObj)}`);

  const planArray = buildCategoryPlan(categoryArray, progressObj, argObj.fromPage);
  if (!planArray.length) return { success: true, message: `BACKFILL: nothing to do, ${progressPath} shows every page done (delete it to start over)` };

  const docArray = await findArticleIndexDocs();
  if (!docArray) return { success: false, message: "BACKFILL FAILED: could not read articles" };
  const articleIndex = buildArticleIndex(docArray);

  const reportArray = await runCategoryPlans(planArray, articleIndex, argObj, progressPath);
  return buildBackfillResult(reportArray, argObj.execute);
};

//after the first failed page, progress stops saving so a re-run resumes from that page
const runCategoryPlans = async (planArray, articleIndex, argObj, progressPath) => {
  const reportArray = [];
  let activeProgressPath = progressPath;

  for (const planObj of planArray) {
    const reportObj = await runCategoryBackfill(planObj, articleIndex, argObj, activeProgressPath);
    writeJsonFile(path.join(argObj.outDir, `backfill-report-${reportObj.category}.json`), reportObj);
    reportArray.push(reportObj);

    if (!activeProgressPath || !reportObj.failedPageArray.length) continue;
    console.log("BACKFILL: progress frozen at last good page after a failure; a re-run resumes from the first failed page");
    activeProgressPath = null;
  }
  return reportArray;
};

//dry run and --category runs keep their own files so they never make a full --execute run skip pages; --from-page keeps none
const buildProgressPath = (argObj) => {
  if (argObj.fromPage) return null;

  const modeText = argObj.execute ? "" : "-dry-run";
  const categoryText = argObj.category ? `-${argObj.category}` : "";
  return path.join(argObj.outDir, `backfill-progress${modeText}${categoryText}.json`);
};

export const loadBackfillProgress = (progressPath) => {
  if (!progressPath || !fs.existsSync(progressPath)) return null;

  try {
    const progressObj = JSON.parse(fs.readFileSync(progressPath, "utf8"));
    if (!progressObj?.category || !Number.isInteger(progressObj.lastCompletedPage)) return null;
    return progressObj;
  } catch (e) {
    console.log(`MIGRATION ERROR: could not read progress file ${progressPath}: ${e.message}`);
    return null;
  }
};

export const saveBackfillProgress = (progressPath, progressObj) => {
  try {
    fs.writeFileSync(progressPath, JSON.stringify(progressObj, null, 2));
    return { success: true, message: `SAVED PROGRESS: ${progressPath}` };
  } catch (e) {
    console.log(`MIGRATION ERROR: could not write progress file ${progressPath}: ${e.message}`);
    return { success: false, message: `could not write progress file ${progressPath}: ${e.message}` };
  }
};

//categories before the saved one are done; the saved one resumes after its last completed page
export const buildCategoryPlan = (categoryArray, progressObj, fromPage) => {
  const planArray = [];
  if (!categoryArray) return planArray;

  const resumeIndex = progressObj ? categoryArray.indexOf(progressObj.category) : -1;
  for (let i = 0; i < categoryArray.length; i++) {
    if (fromPage) {
      planArray.push({ category: categoryArray[i], startPage: fromPage });
      continue;
    }
    if (i < resumeIndex) continue;
    if (i === resumeIndex && progressObj.lastCompletedPage >= progressObj.pageCount) continue;

    const startPage = i === resumeIndex ? progressObj.lastCompletedPage + 1 : 1;
    planArray.push({ category: categoryArray[i], startPage: startPage });
  }
  return planArray;
};

const findArticleIndexDocs = async () => {
  const projection = { _id: 1, url: 1, title: 1, dateNormal: 1, articleId: 1, articleTypeArray: 1 };
  try {
    return await getArticleCollection().find({}, { projection }).toArray();
  } catch (e) {
    console.log("MIGRATION ERROR: find articles for backfill index failed: " + scrubSecrets(e.message));
    return null;
  }
};

export const buildArticleIndex = (docArray) => {
  if (!docArray) return null;

  const urlMap = new Map();
  const titleDateMap = new Map();
  for (const doc of docArray) {
    if (doc.url && !urlMap.has(doc.url)) urlMap.set(doc.url, doc);

    const groupKey = buildGroupKey(doc.title, doc.dateNormal);
    if (!groupKey) continue;
    if (!titleDateMap.has(groupKey)) titleDateMap.set(groupKey, []);
    titleDateMap.get(groupKey).push(doc);
  }
  return { urlMap, titleDateMap };
};

const runCategoryBackfill = async (planObj, articleIndex, argObj, progressPath) => {
  const { category, startPage } = planObj;
  const listURL = articleURLs[category + "Arr"][0];
  const reportObj = buildCategoryReport(category, startPage);
  console.log(`BACKFILL CATEGORY: ${category} | START PAGE: ${startPage} | ${listURL}`);

  let sessionObj = await openArchiveSession(listURL, argObj.delayMs);
  if (!sessionObj) {
    reportObj.failedPageArray.push({ page: startPage, reason: "could not open archive session (page 1 GET failed)" });
    return reportObj;
  }
  reportObj.pageCount = sessionObj.pageCount;

  for (let pageNum = startPage; pageNum <= sessionObj.pageCount; pageNum++) {
    const pageResult = await collectPageLinkItems(listURL, pageNum, sessionObj, argObj.delayMs);
    sessionObj = pageResult.sessionObj;

    await recordPageResult(pageResult.linkItemArray, pageNum, articleIndex, reportObj, argObj.execute);
    console.log(`BACKFILL ${category} PAGE ${pageNum}/${sessionObj.pageCount}: ${pageResult.linkItemArray ? pageResult.linkItemArray.length + " links" : "FAILED"}`);

    if (!progressPath || reportObj.failedPageArray.length) continue;
    saveBackfillProgress(progressPath, { category, lastCompletedPage: pageNum, pageCount: sessionObj.pageCount });
  }

  return reportObj;
};

const buildCategoryReport = (category, startPage) => ({
  category: category,
  startPage: startPage,
  pageCount: null,
  pagesDone: 0,
  failedPageArray: [],
  linksSeen: 0,
  matchedByUrl: 0,
  matchedByTitle: 0,
  typesAdded: 0,
  unmatchedArray: [],
  ambiguousArray: [],
});

//page 1 GET sets the session cookie and _csrf token the page 2+ POSTs need
export const openArchiveSession = async (listURL, delayMs) => {
  const requestConfig = { method: "get", url: listURL, headers: { Referer: KCNA_REFERER } };
  const res = await requestWithRetry(requestConfig, `GET ${listURL}`, delayMs);
  if (!res) return null;

  return buildArchiveSession(res.data, res.headers);
};

const requestWithRetry = async (requestConfig, contextText, delayMs) => {
  await waitMs(delayMs);

  for (let attempt = 0; attempt <= RETRY_DELAY_ARRAY.length; attempt++) {
    const res = await sendKcnaRequest(requestConfig, contextText, attempt);
    if (res) return res;
    if (attempt === RETRY_DELAY_ARRAY.length) break;
    await waitMs(RETRY_DELAY_ARRAY[attempt]);
  }

  console.log(`BACKFILL HTTP GAVE UP after ${RETRY_DELAY_ARRAY.length + 1} attempts: ${contextText}`);
  return null;
};

const waitMs = (ms) => {
  if (!ms) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const sendKcnaRequest = async (requestConfig, contextText, attempt) => {
  try {
    return await axios({ ...requestConfig, timeout: REQUEST_TIMEOUT_MS, responseType: "text" });
  } catch (e) {
    console.log(`BACKFILL HTTP ERROR (attempt ${attempt + 1}) ${contextText}: ${e.code ?? ""} ${e.message}`);
    return null;
  }
};

export const buildArchiveSession = (html, headers) => {
  const pageCount = parsePageCount(html);
  const csrfToken = parseCsrfToken(html);
  if (!pageCount || !csrfToken) {
    console.log(`BACKFILL ERROR: page 1 missing page_cnt (${pageCount}) or _csrf (${Boolean(csrfToken)})`);
    return null;
  }

  return { html, pageCount, csrfToken, cookieHeader: buildCookieHeader(headers) };
};

export const parsePageCount = (html) => {
  if (typeof html !== "string") return null;
  const match = html.match(/var\s+page_cnt\s*=\s*(\d+)/);
  if (!match) return null;

  const pageCount = parseInt(match[1], 10);
  return pageCount > 0 ? pageCount : null;
};

export const parseCsrfToken = (html) => {
  if (typeof html !== "string") return null;
  const document = new JSDOM(html).window.document;
  const csrfInput = document.querySelector("#article_form input[name='_csrf']");
  return csrfInput?.getAttribute("value") || null;
};

//"name=value; Path=/; HttpOnly" -> "name=value", joined for the Cookie request header
export const buildCookieHeader = (headers) => {
  const setCookieArray = headers?.["set-cookie"];
  if (!Array.isArray(setCookieArray) || !setCookieArray.length) return null;

  const cookiePairArray = [];
  for (const setCookie of setCookieArray) {
    const cookiePair = setCookie.split(";")[0].trim();
    if (cookiePair) cookiePairArray.push(cookiePair);
  }
  return cookiePairArray.length ? cookiePairArray.join("; ") : null;
};

//KCNA answers a bad session with an empty 200 page, so 0 links means failure, not the end
const collectPageLinkItems = async (listURL, pageNum, sessionObj, delayMs) => {
  const firstArray = await fetchPageLinkItems(listURL, pageNum, sessionObj, delayMs);
  if (firstArray && firstArray.length) return { linkItemArray: firstArray, sessionObj };

  console.log(`BACKFILL: 0 links on page ${pageNum} of ${listURL}; renewing session and retrying once`);
  const newSessionObj = await openArchiveSession(listURL, delayMs);
  if (!newSessionObj) return { linkItemArray: null, sessionObj };

  const retryArray = await fetchPageLinkItems(listURL, pageNum, newSessionObj, delayMs);
  const linkItemArray = retryArray && retryArray.length ? retryArray : null;
  return { linkItemArray, sessionObj: newSessionObj };
};

const fetchPageLinkItems = async (listURL, pageNum, sessionObj, delayMs) => {
  const html = pageNum === 1 ? sessionObj.html : await postArchivePage(listURL, pageNum, sessionObj, delayMs);
  if (!html) return null;
  return parseLinkItems(html, listURL);
};

const postArchivePage = async (listURL, pageNum, sessionObj, delayMs) => {
  const body = new URLSearchParams({ _csrf: sessionObj.csrfToken, page_num: String(pageNum), cnt_per_page: CNT_PER_PAGE, keyword: "" });
  const headers = { Referer: listURL, "Content-Type": "application/x-www-form-urlencoded" };
  if (sessionObj.cookieHeader) headers.Cookie = sessionObj.cookieHeader;

  const requestConfig = { method: "post", url: listURL, headers: headers, data: body.toString() };
  const res = await requestWithRetry(requestConfig, `POST page ${pageNum} ${listURL}`, delayMs);
  if (!res) return null;
  return res.data;
};

//absolute URL built the same way the scraper stores it: new URL(href, listURL).href
export const parseLinkItems = (html, listURL) => {
  if (typeof html !== "string" || !listURL) return null;

  const document = new JSDOM(html).window.document;
  const linkElementArray = document.querySelectorAll(LINK_SELECTOR);

  const linkItemArray = [];
  for (const linkElement of linkElementArray) {
    const linkItem = buildLinkItem(linkElement, listURL);
    if (linkItem) linkItemArray.push(linkItem);
  }
  return linkItemArray;
};

const buildLinkItem = (linkElement, listURL) => {
  try {
    const url = new URL(linkElement.getAttribute("href"), listURL).href;
    const itemDate = extractItemDate(linkElement.closest(".article") ?? linkElement);
    const dateNormal = itemDate ? normalizeDate(itemDate) : null;
    return { url, title: normalizeText(linkElement.textContent), dateNormal };
  } catch (e) {
    console.log(`BACKFILL: invalid article link ${linkElement.getAttribute("href")} on ${listURL}`);
    return null;
  }
};

const recordPageResult = async (linkItemArray, pageNum, articleIndex, reportObj, execute) => {
  if (!linkItemArray) {
    reportObj.failedPageArray.push({ page: pageNum, reason: "no article links after session retry" });
    return { success: false, message: `PAGE ${pageNum} FAILED` };
  }

  const failedWriteCount = await tagLinkItems(linkItemArray, reportObj.category, articleIndex, reportObj, execute);
  if (failedWriteCount > 0) {
    reportObj.failedPageArray.push({ page: pageNum, reason: `${failedWriteCount} tag writes failed` });
    return { success: false, message: `PAGE ${pageNum} FAILED` };
  }

  reportObj.pagesDone++;
  return { success: true, message: `PAGE ${pageNum} DONE` };
};

//returns how many DB tag writes failed
const tagLinkItems = async (linkItemArray, category, articleIndex, reportObj, execute) => {
  let failedWriteCount = 0;
  for (const linkItem of linkItemArray) {
    reportObj.linksSeen++;
    const matchObj = matchLinkItem(linkItem, articleIndex);

    if (matchObj.matchType === "none") {
      reportObj.unmatchedArray.push(linkItem);
      continue;
    }
    if (matchObj.matchType === "ambiguous") {
      reportObj.ambiguousArray.push({ ...linkItem, articleIdArray: collectArticleIds(matchObj.docArray) });
      continue;
    }

    if (matchObj.matchType === "url") reportObj.matchedByUrl++;
    if (matchObj.matchType === "title") reportObj.matchedByTitle++;

    const addResult = await addCategoryToDoc(matchObj.docArray[0], category, execute);
    if (!addResult.success) failedWriteCount++;
    if (addResult.modified) reportObj.typesAdded++;
  }
  return failedWriteCount;
};

//URL first; else title+date, and only when exactly one doc matches
export const matchLinkItem = (linkItem, articleIndex) => {
  const urlDoc = articleIndex?.urlMap.get(linkItem?.url);
  if (urlDoc) return { matchType: "url", docArray: [urlDoc] };

  const groupKey = buildGroupKey(linkItem?.title, linkItem?.dateNormal);
  const titleDocArray = groupKey ? articleIndex?.titleDateMap.get(groupKey) : null;

  if (!titleDocArray || !titleDocArray.length) return { matchType: "none", docArray: [] };
  if (titleDocArray.length > 1) return { matchType: "ambiguous", docArray: titleDocArray };
  return { matchType: "title", docArray: titleDocArray };
};

const collectArticleIds = (docArray) => {
  const articleIdArray = [];
  for (const doc of docArray) articleIdArray.push(doc.articleId);
  return articleIdArray;
};

//in-memory array is updated too, so later pages see the tag without another DB read
const addCategoryToDoc = async (doc, category, execute) => {
  if (!Array.isArray(doc.articleTypeArray)) doc.articleTypeArray = [];
  if (doc.articleTypeArray.includes(category)) return { success: true, message: "ALREADY TAGGED", modified: false };

  if (!execute) {
    doc.articleTypeArray.push(category);
    return { success: true, message: `WOULD ADD ${category} TO ${doc.url}`, modified: true };
  }

  try {
    const updateData = await getArticleCollection().updateOne({ _id: doc._id }, { $addToSet: { articleTypeArray: category } });
    doc.articleTypeArray.push(category);
    return { success: true, message: `ADDED ${category} TO ${doc.url}`, modified: updateData.modifiedCount === 1 };
  } catch (e) {
    console.log(`BACKFILL ERROR: $addToSet ${category} on articleId ${doc.articleId} (${doc.url}) failed: ` + scrubSecrets(e.message));
    return { success: false, message: `ADD FAILED ${category} ${doc.url}`, modified: false };
  }
};

const buildBackfillResult = (reportArray, execute) => {
  const verbText = execute ? "types added" : "types that WOULD BE added (nothing written)";
  let failedTotal = 0;

  console.log("BACKFILL SUMMARY:");
  for (const reportObj of reportArray) {
    const failedPageText = buildFailedPageText(reportObj.failedPageArray);
    failedTotal += reportObj.failedPageArray.length;
    console.log(
      `  ${reportObj.category}: pages done ${reportObj.pagesDone}/${reportObj.pageCount ?? "?"} (from page ${reportObj.startPage}) | failed pages ${failedPageText} | links ${reportObj.linksSeen} | by url ${reportObj.matchedByUrl} | by title ${reportObj.matchedByTitle} | ${verbText} ${reportObj.typesAdded} | unmatched ${reportObj.unmatchedArray.length} | ambiguous ${reportObj.ambiguousArray.length}`
    );
  }

  const modeText = execute ? "BACKFILL COMPLETE" : "BACKFILL DRY RUN COMPLETE, NOTHING WAS MODIFIED";
  if (failedTotal) return { success: false, message: `${modeText} WITH ${failedTotal} FAILED PAGES: re-run each with --category <type> --from-page <N>` };
  return { success: true, message: modeText };
};

const buildFailedPageText = (failedPageArray) => {
  if (!failedPageArray.length) return "none";
  const pageArray = [];
  for (const failedPage of failedPageArray) pageArray.push(failedPage.page);
  return pageArray.join(",");
};

//++++++++++++++++++++++++++++++++++
//FINALIZE

export const runFinalizePhase = async (argObj) => {
  const missingDocArray = await findMissingTypeArrayDocs();
  if (!missingDocArray) return { success: false, message: "FINALIZE FAILED: could not check articleTypeArray" };
  if (missingDocArray.length) return reportMissingTypeArrayDocs(missingDocArray);

  const legacyCount = await countDocs({ articleType: { $exists: true } });
  if (legacyCount === null) return { success: false, message: "FINALIZE FAILED: could not count articleType docs" };

  if (!argObj.execute) {
    return {
      success: true,
      message: `FINALIZE DRY RUN COMPLETE: WOULD $unset articleType on ${legacyCount} docs and drop index ${OLD_INDEX_NAME}; NOTHING WAS MODIFIED (re-run with --execute)`,
    };
  }

  const unsetResult = await unsetLegacyType();
  if (!unsetResult.success) return unsetResult;

  const dropResult = await dropLegacyIndex();
  if (!dropResult.success) return dropResult;

  const afterCountMap = await countByField("$articleTypeArray", true);
  if (afterCountMap) printCountMap("FINALIZE: articleTypeArray element counts", afterCountMap);

  return { success: true, message: `FINALIZE COMPLETE: ${unsetResult.message} | ${dropResult.message}` };
};

const findMissingTypeArrayDocs = async () => {
  const projection = { _id: 1, articleId: 1, url: 1, title: 1 };
  try {
    return await getArticleCollection().find(MISSING_TYPE_ARRAY_FILTER, { projection }).toArray();
  } catch (e) {
    console.log("MIGRATION ERROR: find docs missing articleTypeArray failed: " + scrubSecrets(e.message));
    return null;
  }
};

const reportMissingTypeArrayDocs = (missingDocArray) => {
  console.log(`FINALIZE: ${missingDocArray.length} docs have no articleTypeArray:`);
  for (const doc of missingDocArray) {
    console.log(`  articleId ${doc.articleId} | ${doc.url} | ${doc.title}`);
  }
  return { success: false, message: `FINALIZE ABORTED: ${missingDocArray.length} docs missing articleTypeArray; NOTHING WAS MODIFIED` };
};

const unsetLegacyType = async () => {
  try {
    const updateData = await getArticleCollection().updateMany({ articleType: { $exists: true } }, { $unset: { articleType: "" } });
    return { success: true, message: `unset articleType on ${updateData.modifiedCount} docs` };
  } catch (e) {
    return { success: false, message: "FINALIZE FAILED: $unset articleType errored: " + scrubSecrets(e.message) };
  }
};

//server error code 27 = IndexNotFound; already dropped counts as done
const dropLegacyIndex = async () => {
  try {
    await getArticleCollection().dropIndex(OLD_INDEX_NAME);
    return { success: true, message: `dropped index ${OLD_INDEX_NAME}` };
  } catch (e) {
    if (isIndexNotFoundError(e)) return { success: true, message: `index ${OLD_INDEX_NAME} already gone` };
    return { success: false, message: `FINALIZE FAILED: dropIndex ${OLD_INDEX_NAME} errored: ` + scrubSecrets(e.message) };
  }
};

const isIndexNotFoundError = (e) => {
  if (e?.code === 27 || e?.codeName === "IndexNotFound") return true;
  return /index not found/i.test(e?.message ?? "");
};

//++++++++++++++++++++++++++++++++++

const closeMigrateDb = async () => {
  try {
    await dbClose();
  } catch (e) {
    console.log("MIGRATION WARNING: could not close MongoDB connection: " + scrubSecrets(e.message));
  }
};

//strip any connection string out of driver error text before logging
const scrubSecrets = (message) => {
  if (!message) return "unknown error";
  return message.replace(/mongodb(\+srv)?:\/\/\S+/gi, "[connection string redacted]");
};

const isCliEntry = () => {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return import.meta.url === pathToFileURL(entryPath).href;
};

if (isCliEntry()) await main();
