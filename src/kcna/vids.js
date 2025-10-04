import path from "path";
import fs from "fs";
import axios from "axios";

import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

export const downloadVidsKCNA = async () => {
  const { vids, vidPath } = CONFIG;
  const vidModel = new dbModel({ keyExists: "url", keyEmpty: "vidSize" }, vids);
  const vidArray = await vidModel.findEmptyItems();
  if (!vidArray || !vidArray.length) return null;

  // console.log("DOWNLOAD VID ARRAY");
  // console.log(vidArray);

  const downloadVidArray = [];
  for (const vidItem of vidArray) {
    const { vidId } = vidItem;
    vidItem.vidName = vidId + ".mp4";
    vidItem.savePath = path.join(vidPath, vidItem.vidName);

    const vidData = await downloadVidFS(vidItem);
    downloadVidArray.push(vidData);
  }
  return downloadVidArray;
};

export const downloadVidFS = async (inputParams) => {
  if (!inputParams) return null;
  const { downloadVidChunkSize, downloadVidConcurrent } = CONFIG;
  const { url, vidId } = inputParams;

  const headers = await downloadVidHeaders(url);
  const vidSize = +headers["content-range"]?.substring(headers["content-range"]?.lastIndexOf("/") + 1, headers["content-range"]?.length); //in bytes
  const totalVidChunks = Math.ceil(vidSize / downloadVidChunkSize);

  const downloadObj = { ...inputParams, headers: headers, vidSize: vidSize, totalVidChunks: totalVidChunks };

  //build chunk array so names / paths in one place
  const chunkArrayDefault = await buildChunkArrayDefault(vidId, vidSize);
  const chunkArrayCompleted = await getChunksCompleted(chunkArrayDefault);
  const chunkArrayPending = chunkArrayDefault.filter((chunk) => !chunkArrayCompleted.includes(chunk));

  if (chunkArrayCompleted && chunkArrayCompleted.length === totalVidChunks) {
    console.log("Vid already downloaded");
    return null;
  }

  if (chunkArrayCompleted && chunkArrayCompleted.length > 0) {
    console.log(`Resuming Chunk ${chunkArrayCompleted.length + 1} of ${totalVidChunks} total chunks`);
  }

  for (let i = 0; i < chunkArrayPending.length; i += downloadVidConcurrent) {
    const batchArray = chunkArrayPending.slice(i, i + downloadVidConcurrent);
    const promiseArray = [];

    for (let j = 0; j < batchArray.length; j++) {
      const chunkToDownload = batchArray[j];
      const chunkObj = { ...chunkToDownload, ...downloadObj };
      await downloadVidChunk(chunkObj);
      promiseArray.push();
    }

    const results = await Promise.allSettled(promiseArray);
  }
};

//res.headers doesnt work, so getting headers by getting small number of bytes
export const downloadVidHeaders = async (url) => {
  const randomBytes = Math.floor(Math.random() * 200);
  const byteText = "bytes=0-" + randomBytes;

  try {
    const resHeaders = await axios({
      method: "get",
      url: url,
      headers: {
        Range: byteText,
      },
      timeout: 30 * 1000, //30 seconds
    });

    if (!resHeaders || !resHeaders.headers) {
      const error = new Error("FAILED TO GET VID HEADERS");
      error.url = url;
      error.function = "downloadVidFS";
      throw error;
    }

    const headers = { ...resHeaders.headers };
    console.log("RES HEADERS");
    console.log(headers);

    return headers;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const buildChunkArrayDefault = async (vidId, vidSize) => {
  if (!vidId || !vidSize) return null;
  const { tempPath, downloadVidChunkSize } = CONFIG;

  const totalVidChunks = Math.ceil(vidSize / downloadVidChunkSize);
  const chunkArray = [];
  for (let i = 0; i < totalVidChunks; i++) {
    const chunkName = `${vidId}_chunk_${i + 1}.mp4`;
    const chunkPath = path.join(tempPath, chunkName);
    const startByte = i * downloadVidChunkSize;
    const endByte = Math.min(startByte + downloadVidChunkSize - 1, vidSize - 1);
    const chunkSize = endByte - startByte + 1;

    const chunkObj = {
      chunkIndex: i + 1,
      chunkName: chunkName,
      chunkPath: chunkPath,
      startByte: startByte,
      endByte: endByte,
      chunkSize: chunkSize,
    };

    chunkArray.push(chunkObj);
  }
  return chunkArray;
};

export const getChunksCompleted = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  //loop through and see if any chunks already downloaded
  const completedChunkArray = [];
  for (let i = 0; i < inputArray.length; i++) {
    const chunk = inputArray[i];
    const { chunkPath, chunkSize } = chunk;

    const chunkStored = fs.existsSync(chunkPath);
    if (!chunkStored) continue;

    //check the chunk is the right size, delete if not
    const chunkStoredSize = fs.statSync(chunkPath).size;
    if (chunkStoredSize !== chunkSize) {
      fs.unlinkSync(chunkPath);
      continue;
    }

    completedChunkArray.push(chunk);
  }

  return completedChunkArray;
};

export const downloadVidChunk = async (inputObj) => {
  if (!inputObj) return null;
  const { url, chunkIndex, chunkPath, startByte, endByte } = inputObj;

  try {
    const res = await axios({
      method: "get",
      url: url,
      timeout: 60 * 1000, //1 minute
      responseType: "stream",
      headers: {
        Range: `bytes=${startByte}-${endByte}`,
      },
    });

    if (!res || !res.data) {
      const error = new Error("CHUNK DOWNLOAD FUCKED");
      error.url = url;
      error.function = "downloadVidChunk";
      throw error;
    }

    const writer = fs.createWriteStream(chunkPath);
    res.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
      res.data.on("error", reject);
    });

    console.log(`Chunk ${chunkIndex} downloaded (bytes ${startByte}-${endByte})`);

    return true;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

//--------------------------

export const uploadVidsKCNA = async () => {
  //build
};
