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

  console.log("NUMBER OF VIDS TO DOWNLOAD");
  console.log(vidArray.length);

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
  const { downloadVidChunkSize, downloadVidConcurrent, vidRetries } = CONFIG;
  const { url, vidId } = inputParams;

  const headers = await downloadVidHeaders(url);
  const vidSize = +headers["content-range"]?.substring(headers["content-range"]?.lastIndexOf("/") + 1, headers["content-range"]?.length); //in bytes
  const totalVidChunks = Math.ceil(vidSize / downloadVidChunkSize);

  //build chunk array so names / paths in one place
  const chunkArrayDefault = await buildChunkArrayDefault(vidId, vidSize);
  const chunksCompleted = await getChunksCompleted(chunkArrayDefault);
  const chunksPending = chunkArrayDefault.filter((chunk) => !chunksCompleted.includes(chunk));

  if (chunksCompleted && chunksCompleted.length === totalVidChunks) {
    console.log("Vid already downloaded");
    return null;
  }

  if (chunksCompleted && chunksCompleted.length > 0) {
    console.log(`Resuming Chunk ${chunksCompleted.length + 1} of ${totalVidChunks} total chunks`);
  }

  const downloadObj = { ...inputParams, headers, vidSize, totalVidChunks };

  console.log("DOWNLOAD OBJ");
  console.log(downloadObj);

  const downloadData = await downloadChunksWithRetries(downloadObj, chunksPending, chunksCompleted);

  console.log("DOWNLOAD DATA");
  console.log(downloadData);
};

export const downloadChunksWithRetries = async (inputObj, chunksPending, chunksCompleted) => {
  if (!inputObj || !chunksPending || !chunksCompleted) return null;
  const { vidRetries, downloadVidConcurrent } = CONFIG;

  for (let i = 0; i < vidRetries; i++) {
    chunksPending = await downloadPendingChunkArray(inputObj, chunksPending, chunksCompleted);

    if (chunksPending.length === 0) {
      console.log("ALL CHUNKS DOWNLOADED");
      return true;
    }

    if (i < vidRetries - 1) {
      console.log(`Retrying download of ${chunksPending.length} chunks (RETRY ATTEMPT ${i + 1})`);
    }
  }

  console.error(`Failed to download ${chunksPending.length} chunks after ${vidRetries} retries`);
  return null;
};

export const downloadPendingChunkArray = async (inputObj, chunksPending, chunksCompleted) => {
  if (!inputObj || !chunksPending || !chunksCompleted) return null;
  const { downloadVidConcurrent } = CONFIG;

  const failedDownloadArray = [];

  for (let i = 0; i < chunksPending.length; i += downloadVidConcurrent) {
    const batchArray = chunksPending.slice(i, i + downloadVidConcurrent);
    const failed = await downloadChunksBatch(inputObj, batchArray, chunksCompleted);
    failedDownloadArray.push(...failed);
  }

  return failedDownloadArray;
};

export const downloadChunksBatch = async (inputObj, batchArray, chunksCompleted) => {
  const { totalVidChunks } = inputObj;

  const promiseArray = batchArray.map((chunk) => {
    const chunkObj = { ...chunk, ...inputObj };
    return downloadVidChunk(chunkObj);
  });

  const results = await Promise.allSettled(promiseArray);

  const failedChunks = [];
  for (let i = 0; i < results.length; i++) {
    const resultItem = results[i];

    if (resultItem.status === "fulfilled" && resultItem.value) {
      chunksCompleted.push(batchArray[i]);
    } else {
      console.error(`Failed chunk ${batchArray[i].chunkIndex}: ${resultItem.reason || "Unknown error"}`);
      failedChunks.push(batchArray[i]);
    }
  }

  const progress = ((chunksCompleted.length / totalVidChunks) * 100).toFixed(1);
  console.log(`Overall progress: ${progress}% (${chunksCompleted.length}/${totalVidChunks} chunks)`);

  return failedChunks;
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
