import path from "path";
import fs from "fs";
import axios from "axios";

import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

export const downloadPicsKCNA = async () => {
  const { pics, picPath } = CONFIG;
  const picModel = new dbModel({ keyExists: "url", keyEmpty: "picSize" }, pics);
  const picArray = await picModel.findEmptyItems();
  if (!picArray || !picArray.length) return null;

  const downloadPicArray = [];
  for (const picItem of picArray) {
    try {
      const { picId, url } = picItem;
      picItem.picName = picId + ".jpg";
      picItem.savePath = path.join(picPath, picItem.picName);

      const picData = await downloadPicFS(picItem);
      const { headers, downloadedSize } = picData;
      picItem.picSize = downloadedSize;
      picItem.headers = headers;

      const storeParams = {
        keyToLookup: "url",
        itemValue: url,
        updateObj: picItem,
      };

      console.log("STORE PARAMS");
      console.log(storeParams);

      const storePicModel = new dbModel(storeParams, pics);
      const storeData = await storePicModel.updateObjItem();

      console.log("PIC STORE DATA");
      console.log(storeData);

      downloadPicArray.push(storeParams);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  return downloadPicArray;
};

export const downloadPicFS = async (inputParams) => {
  if (!inputParams) return null;
  const { url, savePath, picName } = inputParams;
  const { picProgressSize } = CONFIG;

  const picExists = fs.existsSync(savePath);
  if (picExists) {
    const error = new Error("PIC ALREADY DOWNLOADED");
    error.url = url;
    error.function = "downloadPicFS";
    throw error;
  }

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
};

export const uploadPicsKCNA = async () => {
  //build
};
