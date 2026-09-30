import axios from "axios";
import fs from "fs";
import path from "path";

import kcnaState from "../util/state.js";
import dbModel from "../../models/db-model.js";
import { updateLogKCNA } from "../util/log.js";
import { isPlaceholderVidURL } from "./kctv-listing.js";

//KCTV/KCNA Watch requires a browser-like User-Agent + Referer for reliable downloads; no cookies needed
const WATCH_REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
  Referer: "https://kcnawatch.org/",
};

export const uploadVidPagesWatch = async (entryArray) => {
  const watchCollection = process.env.WATCH_COLLECTION;
  if (!kcnaState.scrapeActive) return 0;
  if (!entryArray || !entryArray.length) return 0;

  let storedCount = 0;
  for (const entry of entryArray) {
    if (!kcnaState.scrapeActive) return storedCount;

    const { url } = entry;
    if (!url) continue;

    const checkModel = new dbModel({ url }, watchCollection);
    const exists = await checkModel.urlExists();
    if (exists) continue;

    const vidPageId = await new dbModel({ idKey: "vidPageId" }, watchCollection).nextId();

    const params = {
      ...entry,
      scrapeId: kcnaState.scrapeId,
      vidPageId: vidPageId,
    };

    try {
      const storeModel = new dbModel(params, watchCollection);
      const storeData = await storeModel.storeAny();
      if (!storeData?.acknowledged) continue;

      console.log(`STORED VID PAGE URL: ${url} | VID PAGE ID: ${vidPageId}`);
      storedCount++;
    } catch (e) {
      console.log("MONGO ERROR FOR VID PAGE: " + url);
      console.log(e.message);
    }
  }

  kcnaState.scrapeMessage = `FINISHED UPLOADING ${storedCount} NEW VID PAGES WATCH`;
  await updateLogKCNA();

  console.log("FINISHED VID PAGE UPLOAD WATCH");
  console.log(`STORED ${storedCount} VID PAGES`);

  return storedCount;
};

//++++++++++++++++++++++++++++++++++++++++++

export const downloadVidsWatch = async () => {
  const watchCollection = process.env.WATCH_COLLECTION;
  const vidPath = process.env.WATCH_PATH;
  if (!vidPath) throw new Error("WATCH_PATH environment variable is not set");

  kcnaState.scrapeStep = "KCTV DOWNLOAD WATCH";
  if (!kcnaState.scrapeActive) return 0;

  ensureVidDir(vidPath);

  const vidModel = new dbModel({ keyExists: "url", keyEmpty: "vidSize" }, watchCollection);
  const vidArray = await vidModel.findEmptyItems();
  if (!vidArray || !vidArray.length) return 0;

  console.log(`STARTING DOWNLOAD OF ${vidArray.length} NEW VIDS WATCH`);

  let downloadedCount = 0;
  for (const vidRow of vidArray) {
    if (!kcnaState.scrapeActive) return downloadedCount;

    const { url, date, vidType } = vidRow;
    if (isPlaceholderVidURL(url)) {
      await deletePlaceholderVidWatch(url, watchCollection);
      continue;
    }

    const vidName = buildVidFileName(date, vidType);
    const savePath = path.join(vidPath, vidName);

    const vidData = await downloadVidFS(url, savePath, vidName);
    if (!vidData) continue;

    console.log(`STORING VID: ${vidName} | ${Math.round(vidData.downloadedSize / 1024 / 1024)}MB`);

    const storeParams = {
      keyToLookup: "url",
      itemValue: url,
      updateObj: { vidName: vidName, savePath: savePath, vidSize: vidData.downloadedSize },
    };

    try {
      const storeVidModel = new dbModel(storeParams, watchCollection);
      const storeData = await storeVidModel.updateObjItem();
      if (!storeData) continue;

      console.log(`STORED VID: ${vidName} | MODIFIED: ${storeData.modifiedCount}`);
      downloadedCount++;
    } catch (e) {
      console.log("MONGO ERROR FOR VID DOWNLOAD: " + url);
      console.log(e.message);
    }
  }

  kcnaState.scrapeMessage = `FINISHED DOWNLOADING ${downloadedCount} NEW VIDS WATCH`;
  await updateLogKCNA();

  console.log("FINISHED VID DOWNLOAD WATCH");
  console.log(`DOWNLOADED ${downloadedCount} VIDS`);

  return downloadedCount;
};

//kcnawatch.org stores a placeholder url while it is still processing an upload; delete the row so the next listing run stores the real url
const deletePlaceholderVidWatch = async (url, watchCollection) => {
  try {
    const deleteModel = new dbModel({ keyToLookup: "url", itemValue: url }, watchCollection);
    const deleteData = await deleteModel.deleteItem();

    console.log(`DELETED PLACEHOLDER VID: ${url}`);
    return deleteData;
  } catch (e) {
    console.log("MONGO ERROR FOR PLACEHOLDER VID DELETE: " + url);
    console.log(e.message);
    return null;
  }
};

const ensureVidDir = (vidPath) => {
  if (!vidPath) return;

  try {
    fs.mkdirSync(vidPath, { recursive: true });
  } catch (e) {
    console.log(`FAILED TO CREATE VID DIR: ${vidPath} | ${e.message}`);
  }
};

const buildWatchFileName = (date, vidType, ext) => {
  const itemDate = new Date(date);
  const year = itemDate.getUTCFullYear();
  const month = String(itemDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(itemDate.getUTCDate()).padStart(2, "0");

  return `kctv_${year}-${month}-${day}_${vidType}.${ext}`;
};

const buildVidFileName = (date, vidType) => buildWatchFileName(date, vidType, "mp4");
const buildThumbFileName = (date, vidType) => buildWatchFileName(date, vidType, "jpg");

export const downloadVidFS = async (url, savePath, vidName, attempt = 0) => {
  if (!url || !savePath || !vidName) return null;
  const vidProgressSize = parseInt(process.env.VID_PROGRESS_SIZE) || 20971520;

  if (!kcnaState.scrapeActive) return null;

  try {
    const res = await axios({
      method: "get",
      url: url,
      timeout: 120 * 1000, //2 minutes
      responseType: "stream",
      headers: WATCH_REQUEST_HEADERS,
    });

    if (!res || !res.data || !res.headers) {
      throw new Error(`Empty axios response for ${url}`);
    }

    let downloadedSize = 0;

    const writer = fs.createWriteStream(savePath);
    const stream = res.data.pipe(writer);

    //the "data" listener is registered inside the promise executor so the abort
    //branch can settle the promise directly: writer.destroy() only emits "close",
    //never "finish", so waiting on "finish"/"error" alone would hang forever
    await new Promise((resolve, reject) => {
      res.data.on("data", (chunk) => {
        if (!kcnaState.scrapeActive) {
          writer.destroy();
          res.data.destroy();
          resolve();
          return;
        }

        downloadedSize += chunk.length;
        if (downloadedSize % vidProgressSize < chunk.length) {
          const downloadedMB = Math.floor(downloadedSize / 1024 / 1024);
          console.log(`Downloaded: ${downloadedMB}MB`);
        }
      });

      //pipe() returns the writer, so the response stream needs its own error listener:
      //a mid-download network error (e.g. ECONNRESET) would otherwise be unhandled and never settle
      res.data.on("error", (e) => {
        writer.destroy();
        reject(e);
      });

      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    const contentLength = parseInt(res.headers["content-length"]);
    const lengthMismatch = !isNaN(contentLength) && contentLength !== downloadedSize;

    if (downloadedSize === 0 || lengthMismatch) {
      console.log(`BAD DOWNLOAD: ${vidName} | ${url} | SIZE: ${downloadedSize} | EXPECTED: ${contentLength}`);
      removeVidFS(savePath);
      return retryVidFS(url, savePath, vidName, attempt);
    }

    const returnObj = {
      headers: { ...res.headers }, //converts to normal obj
      downloadedSize: downloadedSize,
    };

    console.log(`DOWNLOAD COMPLETE: ${vidName} | FINAL SIZE: ${Math.round(downloadedSize / 1024 / 1024)}MB`);
    return returnObj;
  } catch (e) {
    console.log(`DOWNLOAD ERROR: ${vidName} | ${e.message}`);
    removeVidFS(savePath);
    return retryVidFS(url, savePath, vidName, attempt);
  }
};

const removeVidFS = (savePath) => {
  try {
    fs.rmSync(savePath, { force: true });
  } catch (e) {
    console.log(`FAILED TO REMOVE VID FILE: ${savePath} | ${e.message}`);
  }
};

const retryVidFS = async (url, savePath, vidName, attempt) => {
  if (attempt !== 0) return null;
  if (!kcnaState.scrapeActive) return null;

  console.log(`RETRYING DOWNLOAD: ${vidName}`);
  return downloadVidFS(url, savePath, vidName, 1);
};

//++++++++++++++++++++++++++++++++++++++++++

//intentionally also backfills rows whose vid already downloaded, since thumbURL was only added later
export const downloadThumbsWatch = async () => {
  const watchCollection = process.env.WATCH_COLLECTION;
  const vidPath = process.env.WATCH_PATH;
  if (!vidPath) throw new Error("WATCH_PATH environment variable is not set");

  kcnaState.scrapeStep = "KCTV THUMBS WATCH";
  if (!kcnaState.scrapeActive) return 0;

  ensureVidDir(vidPath);

  const thumbModel = new dbModel({ keyExists: "thumbURL", keyEmpty: "thumbName" }, watchCollection);
  const thumbArray = await thumbModel.findEmptyItems();
  if (!thumbArray || !thumbArray.length) return 0;

  console.log(`STARTING DOWNLOAD OF ${thumbArray.length} NEW THUMBS WATCH`);

  let downloadedCount = 0;
  for (const thumbRow of thumbArray) {
    if (!kcnaState.scrapeActive) return downloadedCount;

    const { url, thumbURL, date, vidType } = thumbRow;
    if (!thumbURL || !date || !vidType) continue;

    const thumbName = buildThumbFileName(date, vidType);
    const savePath = path.join(vidPath, thumbName);

    const thumbData = await downloadThumbFS(thumbURL, savePath, thumbName);
    if (!thumbData) continue;

    console.log(`STORING THUMB: ${thumbName} | ${Math.round(thumbData.downloadedSize / 1024)}KB`);

    const storeParams = {
      keyToLookup: "url",
      itemValue: url,
      updateObj: { thumbName: thumbName, thumbPath: savePath, thumbSize: thumbData.downloadedSize },
    };

    try {
      const storeThumbModel = new dbModel(storeParams, watchCollection);
      const storeData = await storeThumbModel.updateObjItem();
      if (!storeData) continue;

      console.log(`STORED THUMB: ${thumbName} | MODIFIED: ${storeData.modifiedCount}`);
      downloadedCount++;
    } catch (e) {
      console.log("MONGO ERROR FOR THUMB DOWNLOAD: " + url);
      console.log(e.message);
    }
  }

  kcnaState.scrapeMessage = `FINISHED DOWNLOADING ${downloadedCount} NEW THUMBS WATCH`;
  await updateLogKCNA();

  console.log("FINISHED THUMB DOWNLOAD WATCH");
  console.log(`DOWNLOADED ${downloadedCount} THUMBS`);

  return downloadedCount;
};

export const downloadThumbFS = async (url, savePath, thumbName) => {
  if (!url || !savePath || !thumbName) return null;
  if (!kcnaState.scrapeActive) return null;

  try {
    const res = await axios({
      method: "get",
      url: url,
      timeout: 30 * 1000, //30 seconds
      responseType: "arraybuffer",
      headers: WATCH_REQUEST_HEADERS,
    });

    if (!res || !res.data) {
      throw new Error(`Empty axios response for ${url}`);
    }

    const downloadedSize = res.data.length;
    if (!downloadedSize) {
      console.log(`EMPTY THUMB DOWNLOAD: ${thumbName} | ${url}`);
      removeVidFS(savePath);
      return null;
    }

    fs.writeFileSync(savePath, res.data);

    console.log(`THUMB DOWNLOAD COMPLETE: ${thumbName} | FINAL SIZE: ${Math.round(downloadedSize / 1024)}KB`);
    return { downloadedSize };
  } catch (e) {
    console.log(`THUMB DOWNLOAD ERROR: ${thumbName} | ${e.message}`);
    removeVidFS(savePath);
    return null;
  }
};
