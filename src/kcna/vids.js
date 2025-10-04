import path from "path";
import fs from "fs";
import axios from "axios";

import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

export const downloadVidsKCNA = async () => {
  const { vids, vidPath, tempPath } = CONFIG;
  const vidModel = new dbModel({ keyExists: "url", keyEmpty: "vidSize" }, vids);
  const vidArray = await vidModel.findEmptyItems();
  if (!vidArray || !vidArray.length) return null;

  // console.log("DOWNLOAD VID ARRAY");
  // console.log(vidArray);

  const downloadVidArray = [];
  for (const vidItem of vidArray) {
    try {
      const { vidId, url } = vidItem;
      vidItem.vidName = vidId + ".mp4";
      vidItem.savePath = path.join(vidPath, vidItem.vidName);

      const vidData = await downloadVidFS(vidItem);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }
};

export const downloadVidFS = async (inputParams) => {
  if (!inputParams) return null;
  const { downloadVidChunkSize, tempPath, downloadVidConcurrent } = CONFIG;
  const { url, savePath, vidName } = inputParams;

  const headers = await downloadVidHeaders(url);
  const vidSize = +headers["content-range"]?.substring(headers["content-range"]?.lastIndexOf("/") + 1, headers["content-range"]?.length); //in bytes
  const totalVidChunks = Math.ceil(vidSize / downloadVidChunkSize);

  console.log("VID SIZE");
  console.log(vidSize);
  console.log("TOTAL VID CHUNKS");
  console.log(totalVidChunks);

  //build chunk array so names / paths in one place
  const chunkArray = await buildChunkArray(vidName, vidSize);
  const downloadObj = { ...inputParams, headers: headers, vidSize: vidSize, totalVidChunks: totalVidChunks, chunkArray: chunkArray };

  console.log("CHUNK ARRAY");
  console.log(chunkArray);

  // const completedChunkArray = await getChunksCompleted(downloadObj);
  // if (completedChunkArray && completedChunkArray.length === totalVidChunks) {
  //   console.log("Vid already downloaded");
  //   return null;
  // }

  // if (completedChunkArray && completedChunkArray.length > 0) {
  //   console.log("Resuming Chunk " + completedChunkArray.length + " of " + totalVidChunks + " total chunks");
  // }

  // for (let i = 0; i < chunksToDownloadArray.length; i += downloadVidConcurrent) {
  //   const batchArray = chunksToDownloadArray.slice(i, i + downloadVidConcurrent);
  //   const promiseArray = [];

  //   for (let j = 0; j < batchArray.length; j++) {
  //     const chunkToDownload = batchArray[j];
  //     const chunkObj = { ...chunkToDownload, ...downloadObj };
  //     const chunkData = await downloadVidChunk(chunkObj);
  //     promiseArray.push(chunkData);
  //   }

  //   const results = await Promise.allSettled(promiseArray);
  // }
};

//res.headers doesnt work, so getting headers by getting small number of bytes
export const downloadVidHeaders = async (url) => {
  const randomBytes = Math.floor(Math.random() * 200);
  const byteText = "bytes=0-" + randomBytes;

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
  return headers;
};

export const buildChunkArray = async (vidName, vidSize) => {
  if (!!vidName || !!vidSize) return null;
  const { tempPath, downloadVidChunkSize } = CONFIG;

  const totalVidChunks = Math.ceil(vidSize / downloadVidChunkSize);
  const chunkArray = [];
  for (let i = 0; i < totalVidChunks; i++) {
    const chunkName = `${vidName}_chunk_${i + 1}.mp4`;
    const chunkPath = path.join(tempPath, chunkName);
    const startByte = i * downloadVidChunkSize;
    const endByte = Math.min(startByte + downloadVidChunkSize - 1, vidSize - 1);
    const chunkSize = endByte - startByte + 1;

    const chunkObj = {
      index: i,
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

export const getChunksCompleted = async (inputObj) => {
  if (!inputObj) return null;
  const { chunkArray } = inputObj;

  //loop through and see if any chunks already downloaded
  const completedChunkArray = [];
  for (let i = 0; i < chunkArray.length; i++) {
    const chunk = chunkArray[i];
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

// export const getChunksPending = async (inputObj) => {
//   if (!inputObj) return null;
//   const { downloadVidChunkSize, tempPath } = CONFIG;
//   const { totalVidChunks, vidName, vidSize, chunkArray } = inputObj;

//   const chunksToDownloadArray = [];
//   for (let i = 0; i < chunkArray.length; i++) {
//     const chunk = chunkArray[i];
//     const { chunkPath } = chunk;

//     //skip chunks already downloaded
//     const chunkExists = fs.existsSync(chunkPath);
//     if (chunkExists) continue;

//     const startByte = i * downloadVidChunkSize;
//     const endByte = Math.min(startByte + downloadVidChunkSize - 1, vidSize - 1);
//     if (endByte < startByte || !startByte || !endByte) continue;

//     const downloadParams = {
//       index: i,
//       chunkName: chunkName,
//       chunkPath: chunkPath,
//       startByte: startByte,
//       endByte: endByte,
//     };

//     chunksToDownloadArray.push(downloadParams);
//   }

//   return chunksToDownloadArray;
// };

export const downloadVidChunk = async (inputObj) => {
  if (!inputObj) return null;
  const { url, savePath, vidName, startByte, endByte } = inputObj;

  const res = await axios({
    method: "get",
    url: url,
    timeout: 60 * 1000, //1 minute
    responseType: "stream",
    headers: {
      Range: `bytes=${startByte}-${endByte}`,
    },
  });
};
//--------------------------

export const uploadVidsKCNA = async () => {
  //build
};
