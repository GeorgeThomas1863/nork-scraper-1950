import path from "path";
import fs from "fs";
import axios from "axios";

import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

export const downloadPicsKCNA = async () => {
  const { pics, picPath } = CONFIG;
  const picModel = new dbModel({ keyExists: "url", keyEmpty: "picSize" }, pics);
  const picArray = await picModel.findEmptyItems();

  //CREATE PIC ID AND SAVE IT EARLIER IN PIC DB (maybe make last couple chars in URL?)
  for (const picItem of picArray) {
    try {
      const { url, picId } = picItem;
      const savePath = path.join(picPath, picId + ".jpg");
      const picData = await downloadPicFS(url, savePath);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }
};

export const downloadPicFS = async (url, savePath) => {
  if (!url || !savePath) return null;
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

  if (!res || !res.data) {
    const error = new Error("AXIOS RES FUCKED");
    error.url = url;
    error.function = "downloadPicFS";
    throw error;
  }

  console.log("!!!!!!");
  console.log("DOWNLOAD PIC RES DATA");
  console.log(res.data);

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

  console.log(`DOWNLOAD COMPLETE: ${picId}.jpg | FINAL SIZE: ${Math.round(downloadedSize / 1024)}KB`);
  return { downloadedSize: downloadedSize };
};

export const uploadPicsKCNA = async () => {
  //build
};
