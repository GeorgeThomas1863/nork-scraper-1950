import fs from "fs";
import path from "path";

import kcnaState from "../util/state.js";
import dbModel from "../../models/db-model.js";
import { tgSendMessage, tgPostVidFS } from "../tg-api.js";
import { buildVidChunks, removeVidChunks } from "./chunk-vids.js";
import { buildVidTitleText, buildVidCaptionText } from "./vid-message.js";
import { updateLogKCNA } from "../util/log.js";
import { normalizeInputsTG, sortArrayByDate } from "../util/util.js";

export const uploadVidsTGWatch = async () => {
  const collection = process.env.WATCH_COLLECTION;
  const tgChannelId = process.env.TG_CHANNEL_ID;
  const watchPath = process.env.WATCH_PATH;
  if (!watchPath) throw new Error("WATCH_PATH environment variable is not set");
  if (!kcnaState.scrapeActive) return null;

  const vidModel = new dbModel({ keyExists: "vidSize", keyEmpty: "uploaded" }, collection);
  const vidArray = await vidModel.findEmptyItems();
  if (!vidArray || !vidArray.length) return null;

  console.log("VID ARRAY TO UPLOAD: " + vidArray.length);

  const vidArraySorted = sortVidsByDate(vidArray);
  if (!vidArraySorted) return null;

  const vidPostArray = [];
  for (const vidObj of vidArraySorted) {
    console.log("UPLOADING VID: " + vidObj.url);
    if (!kcnaState.scrapeActive) return vidPostArray;

    const { url } = vidObj;

    const uploadObj = { ...vidObj, tgChannelId, watchPath };
    const storeProgress = (telegramDelivery) => storeVidUpdate(url, { telegramDelivery }, collection);
    const isPosted = await postVidTG(uploadObj, storeProgress);
    if (!isPosted) continue;

    const vidUploadData = buildVidUploadData(uploadObj);
    const isStored = await storeVidUpdate(url, vidUploadData, collection);
    if (!isStored) continue;

    vidPostArray.push(vidUploadData);
  }

  kcnaState.scrapeMessage = `FINISHED UPLOADING ${vidPostArray.length} NEW VIDS TO TG`;
  await updateLogKCNA();

  return vidPostArray;
};

const sortVidsByDate = (vidArray) => sortArrayByDate(vidArray, "vidPages");

const storeVidUpdate = async (url, updateObj, collection) => {
  try {
    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj }, collection);
    const storeData = await storeModel.updateObjItem();
    return Boolean(storeData?.acknowledged && storeData.matchedCount > 0);
  } catch (e) {
    console.log("MONGO ERROR FOR VID UPLOAD: " + url);
    console.log(e.message);
    return false;
  }
};

const buildVidUploadData = (vidObj) => {
  const { tgChannelId, watchPath, url, date, ...storedVid } = vidObj;
  const tgInputs = normalizeInputsTG(url, date);
  return { ...storedVid, url, date, ...tgInputs, uploaded: true };
};

//+++++++++++++++++++++++++++++++++

export const postVidTG = async (inputObj, storeProgress = async () => true) => {
  if (!inputObj) return false;
  const { savePath, vidName, title, date, url, tgChannelId, watchPath, vidPageId, telegramDelivery = {} } = inputObj;
  if (!savePath || !vidName || !title || !date || !url || !tgChannelId || !watchPath) return false;

  const tgInputs = normalizeInputsTG(url, date);
  const uploadObj = { ...inputObj, ...tgInputs };
  const progress = {
    titleSent: Boolean(telegramDelivery.titleSent),
    chunkPathArray: telegramDelivery.chunkPathArray ?? null,
    chunksSent: telegramDelivery.chunksSent ?? 0,
  };

  if (!progress.titleSent) {
    const isSent = await postVidTitleTG(uploadObj);
    if (!isSent) return false;
    progress.titleSent = true;
    if (!(await storeProgress({ ...progress }))) return false;
  }

  if (hasSentAllChunks(progress)) {
    removeVidChunks(progress.chunkPathArray, savePath);
    removeChunkDir(buildChunkDir(watchPath, vidPageId, vidName));
    return true;
  }

  if (!kcnaState.scrapeActive) return false;

  const chunkPathArray = await resolveVidChunks(uploadObj, progress, storeProgress);
  if (!chunkPathArray) return false;

  const isPosted = await postVidChunksTG({ ...uploadObj, chunkPathArray }, progress, storeProgress);
  if (!isPosted) return false;

  removeVidChunks(chunkPathArray, savePath);
  removeChunkDir(buildChunkDir(watchPath, vidPageId, vidName));
  return true;
};

//true when a prior run posted every piece but crashed before storeVidUpdate could
//mark the row uploaded; lets postVidTG return true without rebuilding/reposting
const hasSentAllChunks = (progress) =>
  Boolean(progress.chunkPathArray?.length) && progress.chunksSent >= progress.chunkPathArray.length;

const postVidTitleTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId } = inputObj;

  try {
    const titleText = buildVidTitleText(inputObj);

    const params = {
      chat_id: tgChannelId,
      text: titleText,
      parse_mode: "HTML",
    };

    return await tgSendMessage(params);
  } catch (e) {
    console.log(e.message);
    return null;
  }
};

const resolveVidChunks = async (uploadObj, progress, storeProgress) => {
  const { savePath, vidName, watchPath, vidPageId } = uploadObj;

  const hasValidChunks = progress.chunkPathArray?.length && allChunksExist(progress.chunkPathArray);
  if (hasValidChunks) return progress.chunkPathArray;

  const chunkDir = buildChunkDir(watchPath, vidPageId, vidName);
  const baseName = path.parse(vidName).name;
  const chunkPathArray = await buildVidChunks(savePath, chunkDir, baseName);
  if (!chunkPathArray) return null;

  progress.chunkPathArray = chunkPathArray;
  progress.chunksSent = 0;
  if (!(await storeProgress({ ...progress }))) return null;

  return chunkPathArray;
};

//per-video chunk dir so two rows with the same date/type never share (and delete)
//each other's pieces on resume; falls back to the file name if vidPageId is absent
const buildChunkDir = (watchPath, vidPageId, vidName) => {
  const chunkKey = vidPageId ?? path.parse(vidName).name;
  return path.join(watchPath, "tg", String(chunkKey));
};

const removeChunkDir = (chunkDir) => {
  try {
    fs.rmSync(chunkDir, { recursive: true, force: true });
  } catch (e) {
    console.log(`FAILED TO REMOVE CHUNK DIR: ${chunkDir} | ${e.message}`);
  }
};

const allChunksExist = (chunkPathArray) => {
  for (const chunkPath of chunkPathArray) {
    if (!fs.existsSync(chunkPath)) return false;
  }
  return true;
};

const postVidChunksTG = async (uploadObj, progress, storeProgress) => {
  const { chunkPathArray, tgChannelId, thumbPath } = uploadObj;
  const partCount = chunkPathArray.length;

  for (let index = progress.chunksSent; index < chunkPathArray.length; index++) {
    if (!kcnaState.scrapeActive) return false;

    const chunkPath = chunkPathArray[index];
    const caption = index === 0 ? buildVidCaptionText({ ...uploadObj, partCount }, 1, partCount) : undefined;

    const data = await tgPostVidFS({ chatId: tgChannelId, savePath: chunkPath, caption, mode: "HTML", thumbPath });
    if (!data) return false;

    progress.chunksSent = index + 1;
    if (!(await storeProgress({ ...progress }))) return false;
  }

  return true;
};
