import axios from "axios";
import fs from "fs";
import path from "path";

import kcnaState from "../util/state.js";
import dbModel from "../../models/db-model.js";
import { tgPostPicFS } from "../tg-api.js";
import { updateLogKCNA } from "../util/log.js";

export const downloadPicsKCNA = async () => {
  const pics = process.env.PICS_COLLECTION; const picPath = process.env.PIC_PATH;
  if (!kcnaState.scrapeActive) return null;

  const picModel = new dbModel({ keyExists: "url", keyEmpty: "picSize" }, pics);
  const picArray = await picModel.findEmptyItems();
  if (!picArray || !picArray.length) return null;

  console.log(`STARTING DOWLOAD OF ${picArray.length} NEW PICS`);

  const downloadPicArray = [];
  for (const picItem of picArray) {
    if (!kcnaState.scrapeActive) return downloadPicArray;

    const { picId, url } = picItem;
    const picName = `kcna_pic_${picId}.jpg`;
    const savePath = path.join(picPath, picName);

    const picData = await downloadPicFS(url, savePath, picName);
    if (!picData) continue;

    const picParams = {
      ...picItem,
      picName: picName,
      savePath: savePath,
      picSize: picData.downloadedSize,
      headers: picData.headers,
    };

    console.log(`STORING PIC: ${picId} | ${picName} | ${Math.round(picData.downloadedSize / 1024)}KB`);

    const storeParams = {
      keyToLookup: "url",
      itemValue: url,
      updateObj: picParams,
    };

    try {
      const storePicModel = new dbModel(storeParams, pics);
      const storeData = await storePicModel.updateObjItem();
      if (!storeData) continue;
      console.log(`STORED PIC: ${picName} | MODIFIED: ${storeData.modifiedCount}`);

      downloadPicArray.push(storeParams);
    } catch (e) {
      console.log("MONGO ERROR FOR PIC DOWNLOAD: " + url);
      console.log(e.message);
    }
  }

  kcnaState.scrapeStep = "VID DOWNLOAD KCNA";
  kcnaState.scrapeMessage = `FINISHED DOWNLOADING ${downloadPicArray.length} NEW PICS`;
  await updateLogKCNA();

  console.log("FINISHED PIC DOWNLOAD");
  console.log(`DOWNLOADED ${downloadPicArray.length} PICS`);

  return downloadPicArray;
};

export const downloadPicFS = async (url, savePath, picName, attempt = 0) => {
  if (!url || !savePath || !picName) return null;
  const picProgressSize = parseInt(process.env.PIC_PROGRESS_SIZE);

  if (!kcnaState.scrapeActive) return null;

  try {
    //KCNA's photo endpoint answers 200 with an empty body unless a Referer header is sent
    const res = await axios({
      method: "get",
      url: url,
      timeout: 60 * 1000, //1 minute
      responseType: "stream",
      headers: { Referer: process.env.KCNA_BASE_URL + "/" },
    });

    if (!res || !res.data || !res.headers) {
      throw new Error(`Empty axios response for ${url}`);
    }

    let downloadedSize = 0;

    const writer = fs.createWriteStream(savePath);
    const stream = res.data.pipe(writer);

    res.data.on("data", (chunk) => {
      if (!kcnaState.scrapeActive) {
        writer.destroy();
        res.data.destroy();
        return;
      }

      // Log progress in KB every 100KB
      downloadedSize += chunk.length;
      if (downloadedSize % picProgressSize < chunk.length) {
        const downloadedKB = Math.floor(downloadedSize / 1024);
        console.log(`Downloaded: ${downloadedKB}KB`);
      }
    });
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    if (downloadedSize === 0) {
      console.log(`EMPTY DOWNLOAD: ${picName} | ${url}`);
      removePicFS(savePath);
      return retryPicFS(url, savePath, picName, attempt);
    }

    const returnObj = {
      headers: { ...res.headers }, //converts to normal obj
      downloadedSize: downloadedSize,
    };

    console.log(`DOWNLOAD COMPLETE: ${picName} | FINAL SIZE: ${Math.round(downloadedSize / 1024)}KB`);
    return returnObj;
  } catch (e) {
    console.log(`DOWNLOAD ERROR: ${picName} | ${e.message}`);
    removePicFS(savePath);
    return retryPicFS(url, savePath, picName, attempt);
  }
};

const removePicFS = (savePath) => {
  try {
    fs.rmSync(savePath, { force: true });
  } catch (e) {
    console.log(`FAILED TO REMOVE PIC FILE: ${savePath} | ${e.message}`);
  }
};

const retryPicFS = async (url, savePath, picName, attempt) => {
  if (attempt !== 0) return null;
  if (!kcnaState.scrapeActive) return null;

  console.log(`RETRYING DOWNLOAD: ${picName}`);
  return downloadPicFS(url, savePath, picName, 1);
};

//++++++++++++++++++++++++++++++++++++++++++

export const postPicArrayTG = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const postPicDataArray = [];
  for (const pic of inputArray) {
    if (!kcnaState.scrapeActive) return postPicDataArray;

    const postPicData = await postPicTG(pic);
    if (!postPicData) continue;

    //add uploaded flag
    postPicData.uploaded = true;

    postPicDataArray.push(postPicData);
  }

  return postPicDataArray;
};

export const postPicTG = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath, caption, tgChannelId, picName } = inputObj;

  // if (!kcnaState.scrapeActive) return null;

  const params = {
    chatId: tgChannelId,
    savePath: savePath,
    caption: caption,
    mode: "html",
  };

  console.log(`POSTING PIC TG: ${picName || savePath} | CHAT: ${tgChannelId}`);

  const data = await tgPostPicFS(params);
  if (!data) return null;

  console.log(`POSTED PIC TG: ${picName || savePath} | MSG: ${data.result?.message_id}`);

  return data;
};
