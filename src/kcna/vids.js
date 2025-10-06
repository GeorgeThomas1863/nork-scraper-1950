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

  console.log("STARTING VIDEO DOWNLOAD");
  console.log(`NUMBER OF VIDS TO DOWNLOAD: ${vidArray.length}`);

  const downloadVidArray = [];
  for (const vidItem of vidArray) {
    try {
      const { vidId, url } = vidItem;
      vidItem.vidName = vidId + ".mp4";
      vidItem.savePath = path.join(vidPath, vidItem.vidName);

      const vidData = await downloadVidFS(vidItem);
      if (!vidData) continue;

      const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: vidData }, vids);
      const storeData = await storeModel.updateObjItem();
      console.log("STORE DATA");
      console.log(storeData);

      downloadVidArray.push(vidData);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  console.log("FINISHED VIDEO DOWNLOAD");
  console.log(`DOWNLOADED ${downloadVidArray.length} VIDS`);

  return downloadVidArray;
};

export const downloadVidFS = async (inputParams) => {
  if (!inputParams) return null;
  const { downloadVidChunkSize, vids } = CONFIG;
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
    return chunksCompleted;
  }

  if (chunksCompleted && chunksCompleted.length > 0) {
    console.log(`Resuming Chunk ${chunksCompleted.length + 1} of ${totalVidChunks} total chunks`);
  }

  const downloadObj = { ...inputParams, headers, vidSize, totalVidChunks, chunkArrayDefault, chunksPending, chunksCompleted };

  //throw error on failed download
  const downloadChunksData = await downloadChunksWithRetries(downloadObj);
  if (!downloadChunksData || !downloadChunksData.length) {
    const error = new Error("FAILED TO DOWNLOAD VIDEO");
    error.url = url;
    error.function = "downloadVidFS";
    throw error;
  }

  //most check prob unnecessary, remove later
  if (downloadChunksData.length < totalVidChunks * 0.9) {
    const error = new Error("FAILED TO DOWNLOAD MOST CHUNKS, LESS THAN 90% DOWNLOADED");
    error.url = url;
    error.function = "downloadVidFS";
    throw error;
  }

  //otherwise merge chunks and cleanup
  await mergeChunks(downloadObj);
  await cleanupTempFiles(downloadObj);

  //defining returnObj as downloadObj without 2 items (which are renamed to remove them bc already defined in function)
  const { chunksPending: _, chunksCompleted: __, chunkArrayDefault: ___, ...returnObj } = downloadObj;

  // console.log("STORE OBJ");
  // console.log(storeObj);

  //store e
  // const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: storeObj }, vids);
  // const storeData = await storeModel.updateObjItem();

  // console.log("STORE DATA");
  // console.log(storeData);

  return returnObj;
};

export const downloadChunksWithRetries = async (inputObj) => {
  if (!inputObj) return null;
  const { vidRetries } = CONFIG;

  for (let i = 0; i < vidRetries; i++) {
    inputObj.chunksPending = await downloadPendingChunkArray(inputObj);

    if (inputObj.chunksPending.length === 0) {
      console.log("ALL CHUNKS DOWNLOADED");
      return inputObj.chunksCompleted;
    }

    if (i < vidRetries - 1) {
      console.log(`Retrying download of ${inputObj.chunksPending.length} chunks (RETRY ATTEMPT ${i + 1})`);
    }
  }

  console.error(`Failed to download ${inputObj.chunksPending.length} chunks after ${vidRetries} retries`);
  return null;
};

export const downloadPendingChunkArray = async (inputObj) => {
  if (!inputObj) return null;
  const { downloadVidConcurrent } = CONFIG;
  const { chunksPending } = inputObj;

  const failedDownloadArray = [];

  for (let i = 0; i < chunksPending.length; i += downloadVidConcurrent) {
    const batchArray = chunksPending.slice(i, i + downloadVidConcurrent);
    const failedObj = await downloadChunksBatch(inputObj, batchArray);
    failedDownloadArray.push(...failedObj);
  }

  return failedDownloadArray;
};

export const downloadChunksBatch = async (inputObj, inputArray) => {
  if (!inputObj || !inputArray || !inputArray.length) return null;
  const { totalVidChunks, chunksCompleted } = inputObj;

  const promiseArray = [];
  for (let i = 0; i < inputArray.length; i++) {
    const chunk = inputArray[i];
    const chunkObj = { ...chunk, ...inputObj };
    const promise = downloadVidChunk(chunkObj);
    promiseArray.push(promise);
  }

  const results = await Promise.allSettled(promiseArray);

  const failedChunks = [];
  for (let i = 0; i < results.length; i++) {
    const resultItem = results[i];
    const chunk = inputArray[i];

    if (resultItem.status !== "fulfilled" || !resultItem.value) {
      console.error(`Failed chunk ${chunk.chunkIndex}: ${resultItem.reason || "Unknown error"}`);
      failedChunks.push(chunk);
      continue;
    }
    chunksCompleted.push(chunk);
  }

  const progress = ((chunksCompleted.length / totalVidChunks) * 100).toFixed(1);
  console.log(`Overall progress: ${progress}% (${chunksCompleted.length}/${totalVidChunks} chunks)`);

  return failedChunks;
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

//-------------------

//UTIL DOWNLOAD FUNCTIONS

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

export const mergeChunks = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath, chunkArrayDefault } = inputObj;

  console.log("Merging chunks...");
  const writeStream = fs.createWriteStream(savePath);

  for (let i = 0; i < chunkArrayDefault.length; i++) {
    const chunk = chunkArrayDefault[i];
    const { chunkPath, chunkIndex } = chunk;
    if (!fs.existsSync(chunkPath)) continue;

    console.log(`MERGING CHUNK ${chunkIndex} OF ${chunkArrayDefault.length}`);

    const chunkData = fs.readFileSync(chunkPath);
    writeStream.write(chunkData);
    fs.unlinkSync(chunkPath); // Clean up temp file
  }

  // CRITICAL FOR PROPER AWAITING AND LATER CHECKS
  await new Promise((resolve, reject) => {
    writeStream.on("finish", () => {
      console.log("Merge complete");
      resolve();
    });
    writeStream.on("error", (error) => {
      console.error("Error during merge:", error);
      reject(error);
    });
    writeStream.end();
  });
};

export const cleanupTempFiles = async (inputObj) => {
  if (!inputObj) return null;
  const { chunkArrayDefault } = inputObj;

  for (let i = 0; i < chunkArrayDefault.length; i++) {
    const chunk = chunkArrayDefault[i];
    const { chunkPath } = chunk;
    if (fs.existsSync(chunkPath)) {
      fs.unlinkSync(chunkPath);
    }
  }

  return true;
};

//--------------------------

