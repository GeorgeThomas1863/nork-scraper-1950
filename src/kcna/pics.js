import axios from "axios";
import fs from "fs";
import path from "path";

import CONFIG from "../../config/config.js";
import kcnaState from "../util/state.js";
import dbModel from "../../models/db-model.js";
import { tgPostPicFS } from "../tg-api.js";
import { updateLogKCNA } from "../util/log.js";

export const downloadPicsKCNA = async () => {
  const { pics, picPath } = CONFIG;
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

    console.log("PIC DOWNLOAD STORE PARAMS");
    console.log(picParams);

    const storeParams = {
      keyToLookup: "url",
      itemValue: url,
      updateObj: picParams,
    };

    try {
      const storePicModel = new dbModel(storeParams, pics);
      const storeData = await storePicModel.updateObjItem();
      if (!storeData) continue;
      console.log("PIC DOWNLOAD STORE DATA");
      console.log(storeData);

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

export const downloadPicFS = async (url, savePath, picName) => {
  if (!url || !savePath || !picName) return null;
  const { picProgressSize } = CONFIG;

  if (!kcnaState.scrapeActive) return null;

  try {
    const res = await axios({
      method: "get",
      url: url,
      timeout: 60 * 1000, //1 minute
      responseType: "stream",
    });

    if (!res || !res.data || !res.headers) {
      const error = new Error("AXIOS RES FUCKED");
      error.url = url;
      error.function = "downloadPicFS";
      throw error;
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

    const returnObj = {
      headers: { ...res.headers }, //converts to normal obj
      downloadedSize: downloadedSize,
    };

    console.log(`DOWNLOAD COMPLETE: ${picName} | FINAL SIZE: ${Math.round(downloadedSize / 1024)}KB`);
    return returnObj;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
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
  const { savePath, caption } = inputObj;
  const { tgChannelId } = CONFIG;

  // if (!kcnaState.scrapeActive) return null;

  const params = {
    chatId: tgChannelId,
    savePath: savePath,
    caption: caption,
    mode: "html",
  };

  console.log("POST PIC TG PARAMS");
  console.log(params);

  const data = await tgPostPicFS(params);
  if (!data) return null;

  console.log("PIC UPLOAD POST DATA");
  console.log(data);

  return data;
};
