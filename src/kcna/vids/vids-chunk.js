import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";

import CONFIG from "../../../config/config.js";

const execAsync = promisify(exec);

export const chunkVidFS = async (inputObj) => {
  if (!inputObj) return null;
  const { vidData } = inputObj;

  const chunkArray = await buildChunkArray(vidData);
  if (!chunkArray || !chunkArray.length) return null;

  const promiseArray = [];
  for (let i = 0; i < chunkArray.length; i++) {
    const chunk = chunkArray[i];
    const { chunkPath } = chunk;

    const command = await buildChunkCommand(chunk);

    promiseArray.push(
      (async () => {
        await execAsync(command);
        const stats = await stat(chunkPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`✓ ${chunkPath} created (${sizeMB} MB)`);
      })()
    );
  }

  await Promise.all(promiseArray);

  return chunkArray;
};

export const buildChunkArray = async (inputObj) => {
  if (!inputObj) return null;
  const { vidId, vidSize } = inputObj;
  const { uploadVidChunkSize, tmpPath } = CONFIG;

  const vidSeconds = await calcVidSeconds(inputObj);
  const totalChunks = Math.ceil(vidSize / uploadVidChunkSize);
  const chunkSeconds = Math.ceil(vidSeconds / totalChunks);

  const chunkArray = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(tmpPath, `${vidId}_chunk_${i + 1}.mp4`);
    const startTime = i * chunkSeconds;

    const chunkObj = { ...inputObj, chunkPath, startTime, chunkSeconds };
    if (!chunkObj) continue;

    chunkArray.push(chunkObj);
  }

  return chunkArray;
};

export const calcVidSeconds = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath } = inputObj;

  const { stdout: durationOutput } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${savePath}"`);

  const vidSeconds = parseFloat(durationOutput.trim());

  return vidSeconds;
};

export const buildChunkCommand = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath, startTime, chunkSeconds, chunkPath } = inputObj;

  const command = `ffmpeg -i "${savePath}" -ss ${startTime} -t ${chunkSeconds} -c copy -avoid_negative_ts make_zero "${chunkPath}"`;
  console.log(`Creating ${chunkPath}...`);

  return command;
};

// export const buildFileArray = async (inputObj) => {
//   if (!inputObj) return null;
//   const { tmpDir, chunkPath } = inputObj;

//   const fileArray = await readdir(tmpDir);
//   if (!fileArray || !fileArray.length) return null;

//   //prob not needed
//   const sortArray = fileArray.filter((chunk) => chunk.startsWith(chunkPath) && chunk.endsWith(".mp4")).sort();

//   return sortArray;
// };

// export const buildChunkArray = async (inputObj) => {
//   if (!inputObj) return null;
//   const { tmpDir, chunkPath, totalChunks } = inputObj;

//   const fileArray = await readdir(tmpDir);
//   if (!fileArray || !fileArray.length) return null;

//   //prob not needed
//   const sortArray = fileArray.filter((chunk) => chunk.startsWith(chunkPath) && chunk.endsWith(".mp4")).sort();

//   const chunkArray = [];
//   for (let i = 0; i < sortArray.length; i++) {
//     const chunkPath = path.join(tmpDir, sortArray[i]);
//     if (!chunkPath) continue;
//     chunkArray.push(chunkPath);
//   }

//   return chunkArray;
// };

// export const runChunkCommand = async (inputObj) => {
//   if (!inputObj) return null;
//   const { savePath, chunkPath, totalChunks, uploadVidChunkSize } = inputObj;

//   const command = `ffmpeg -i "${savePath}" -c copy -map 0 -f segment -segment_size ${uploadVidChunkSize} -reset_timestamps 1 -break_non_keyframes 1 "${chunkPath}"`;
//   console.log(`Chunking video into ${totalChunks} 10MB segments...`);
//   const commandData = await execAsync(command);

//   return commandData;
// };
