import path from "path";
import fs from "fs";
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

    const chunkExists = fs.existsSync(chunkPath);
    if (chunkExists) {
      console.log(`Chunk ${chunkPath} already exists`);
      continue;
    }

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

  const returnObj = { ...inputObj, chunkArray };

  return returnObj;
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
    const chunkName = `${vidId}_chunk_${i + 1}.mp4`;
    const chunkPath = path.join(tmpPath, chunkName);
    const startTime = i * chunkSeconds;

    const chunkObj = { ...inputObj, chunkName, chunkPath, startTime, chunkSeconds };
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
