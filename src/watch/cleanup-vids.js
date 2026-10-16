import fs from "fs";
import path from "path";

import kcnaState from "../util/state.js";
import dbModel from "../../models/db-model.js";

const DEFAULT_KEEP_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;

export const cleanupOldVidsWatch = async () => {
  const watchCollection = process.env.WATCH_COLLECTION;
  const watchPath = process.env.WATCH_PATH;
  if (!watchPath) throw new Error("WATCH_PATH environment variable is not set");
  if (!kcnaState.scrapeActive) return 0;

  const cutoffDate = buildCutoffDate(resolveKeepDays());
  const candidateArray = await findCleanupCandidates(cutoffDate, watchCollection);
  if (!candidateArray) return 0;

  let deletedCount = 0;
  let freedBytes = 0;
  for (const vidRow of candidateArray) {
    if (!kcnaState.scrapeActive) break;
    if (!isTelegramDeliveryComplete(vidRow.telegramDelivery)) continue;

    const freedSize = await deleteVidFileWatch(vidRow, watchPath, watchCollection);
    if (freedSize === null) continue;

    deletedCount++;
    freedBytes += freedSize;
  }

  const keptCount = candidateArray.length - deletedCount;
  console.log(`CLEANUP WATCH: deleted ${deletedCount} vids, freed ${formatMB(freedBytes)} MB, kept ${keptCount}`);

  return deletedCount;
};

const resolveKeepDays = () => {
  const rawValue = process.env.WATCH_KEEP_DAYS;
  if (!/^\d+$/.test(rawValue ?? "")) return DEFAULT_KEEP_DAYS;

  const keepDays = Number(rawValue);
  if (keepDays < 1) return DEFAULT_KEEP_DAYS;

  return keepDays;
};

const buildCutoffDate = (keepDays) => new Date(Date.now() - keepDays * MS_PER_DAY);

const findCleanupCandidates = async (cutoffDate, watchCollection) => {
  const filterObj = {
    site: "watch",
    date: { $lt: cutoffDate },
    uploaded: true,
    "telegramDelivery.titleSent": true,
    localDeleted: { $ne: true },
  };

  try {
    const findModel = new dbModel({ filterObj }, watchCollection);
    return await findModel.findMatching();
  } catch (e) {
    console.log("MONGO ERROR FOR CLEANUP WATCH QUERY");
    console.log(e.message);
    return null;
  }
};

const isTelegramDeliveryComplete = (telegramDelivery) => {
  if (!telegramDelivery?.titleSent) return false;

  const { chunkPathArray, chunksSent } = telegramDelivery;
  if (!Array.isArray(chunkPathArray) || !chunkPathArray.length) return false;

  return chunksSent >= chunkPathArray.length;
};

//returns the freed byte count, or null when the record was skipped or failed
const deleteVidFileWatch = async (vidRow, watchPath, watchCollection) => {
  const { url, savePath } = vidRow;

  if (!isSafeVidPath(savePath, watchPath)) {
    console.log(`CLEANUP WATCH SKIPPED UNSAFE PATH: ${url} | ${savePath}`);
    return null;
  }

  const freedSize = removeVidFileWatch(url, savePath);
  if (freedSize === null) return null;

  const isMarked = await markVidDeletedWatch(url, watchCollection);
  if (!isMarked) return null;

  console.log(`CLEANUP WATCH DELETED: ${path.basename(savePath)} | ${formatMB(freedSize)}MB`);
  return freedSize;
};

const isSafeVidPath = (savePath, watchPath) => {
  if (typeof savePath !== "string" || !savePath) return false;
  if (path.extname(savePath).toLowerCase() !== ".mp4") return false;

  return path.dirname(path.resolve(savePath)) === path.resolve(watchPath);
};

const removeVidFileWatch = (url, savePath) => {
  try {
    const fileSize = fs.lstatSync(savePath, { throwIfNoEntry: false })?.size ?? 0;
    fs.rmSync(savePath, { force: true });
    return fileSize;
  } catch (e) {
    console.log("FS ERROR FOR CLEANUP WATCH: " + url);
    console.log(e.message);
    return null;
  }
};

const markVidDeletedWatch = async (url, watchCollection) => {
  const updateObj = { localDeleted: true, localDeletedAt: new Date() };

  try {
    const markModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj }, watchCollection);
    const markData = await markModel.updateObjItem();
    return Boolean(markData?.acknowledged && markData.matchedCount > 0);
  } catch (e) {
    console.log("MONGO ERROR FOR CLEANUP WATCH MARK: " + url);
    console.log(e.message);
    return false;
  }
};

const formatMB = (bytes) => (bytes / BYTES_PER_MB).toFixed(1);
