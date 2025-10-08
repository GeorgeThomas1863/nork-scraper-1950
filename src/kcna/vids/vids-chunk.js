import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";

import CONFIG from "../../../config/config.js";

const execAsync = promisify(exec);

export const chunkVidFS = async (inputObj) => {
  if (!inputObj) return null;
  const { vidData } = inputObj;
  const { vidId, vidSize, savePath } = vidData;
  const { tmpPath, uploadVidChunkSize } = CONFIG;

  const vidSeconds = await calcVidSeconds(vidData);
  const totalChunks = Math.ceil(vidSize / uploadVidChunkSize);

  const chunkSeconds = Math.ceil(vidSeconds / totalChunks);

  const chunkObj = { ...vidData, tmpDir: tmpPath, totalChunks, uploadVidChunkSize, chunkSeconds, vidSeconds };

  const promiseArray = [];
  for (let i = 0; i < totalChunks; i++) {
    // const chunk = totalChunks[i];
    const chunkPath = path.join(tmpPath, `${vidId}_chunk_${i + 1}.mp4`);
    const startTime = i * chunkSeconds;
    // const endTime = startTime + chunkSeconds;

    const command = `ffmpeg -i "${savePath}" -ss ${startTime} -t ${chunkSeconds} -c copy -avoid_negative_ts make_zero "${chunkPath}"`;
    console.log(`Creating ${chunkPath}...`);

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

  return chunkObj;
};

export const calcVidSeconds = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath } = inputObj;

  const { stdout: durationOutput } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${savePath}"`);

  const vidSeconds = parseFloat(durationOutput.trim());

  return vidSeconds;
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
