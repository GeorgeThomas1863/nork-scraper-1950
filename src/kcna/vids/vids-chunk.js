import path from "path";
import fs from "fs";
import { stat } from "fs/promises";

import CONFIG from "../../../config/config.js";
import kcnaState from "../util/state.js";

// import { exec } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";

// const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

// export const chunkVidFS = async (inputObj) => {
//   if (!inputObj) return null;
//   const { vidData } = inputObj;

//   if (!kcnaState.scrapeActive) return null;

//   const chunkArray = await buildChunkArray(vidData);
//   if (!chunkArray || !chunkArray.length) return inputObj;

//   const promiseArray = [];
//   for (let i = 0; i < chunkArray.length; i++) {
//     if (!kcnaState.scrapeActive) return promiseArray;

//     try {
//       const chunk = chunkArray[i];
//       const { chunkPath } = chunk;

//       const chunkExists = fs.existsSync(chunkPath);
//       if (chunkExists) {
//         console.log(`Chunk ${chunkPath} already exists`);
//         continue;
//       }

//       const command = await buildChunkCommand(chunk);

//       promiseArray.push(
//         (async () => {
//           await execAsync(command);
//           const stats = await stat(chunkPath);
//           const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
//           console.log(`✓ ${chunkPath} created (${sizeMB} MB)`);
//         })()
//       );
//     } catch (e) {
//       console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
//       continue;
//     }
//   }

//   // await Promise.all(promiseArray);

//   //claude addtion below
//   const results = await Promise.allSettled(promiseArray);

//   const failures = results.filter((r) => r.status === "rejected");
//   if (failures.length > 0) {
//     console.log(`Failed to create ${failures.length} chunks`);
//   }

//   const returnObj = { ...inputObj, chunkArray };

//   return returnObj;
// };

export const chunkVidFS = async (inputObj) => {
  if (!inputObj) return null;
  const { vidData } = inputObj;

  if (!kcnaState.scrapeActive) return null;

  const chunkArray = await buildChunkArray(vidData);
  if (!chunkArray || !chunkArray.length) return inputObj;

  const promiseArray = [];
  for (let i = 0; i < chunkArray.length; i++) {
    if (!kcnaState.scrapeActive) return null;

    try {
      const chunk = chunkArray[i];
      const { chunkPath } = chunk;

      const chunkExists = fs.existsSync(chunkPath);
      if (chunkExists) {
        console.log(`Chunk ${chunkPath} already exists`);
        continue;
      }

      const commandObj = await buildChunkCommand(chunk);
      if (!commandObj) continue;

      promiseArray.push(
        (async () => {
          await execFileAsync(commandObj.command, commandObj.args);
          const stats = await stat(chunkPath);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`✓ ${chunkPath} created (${sizeMB} MB)`);
        })()
      );
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
      continue;
    }
  }

  const results = await Promise.allSettled(promiseArray);

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.log(`Failed to create ${failures.length} chunks`);
  }

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
    if (!kcnaState.scrapeActive) return chunkArray;

    const chunkName = `${vidId}_chunk_${i + 1}.mp4`;
    const chunkPath = path.join(tmpPath, chunkName);
    const startTime = i * chunkSeconds;

    const chunkObj = { ...inputObj, chunkName, chunkPath, startTime, chunkSeconds };
    if (!chunkObj) continue;

    chunkArray.push(chunkObj);
  }

  return chunkArray;
};

//COMMAND INJECTION
// export const calcVidSeconds = async (inputObj) => {
//   if (!inputObj) return null;
//   const { savePath } = inputObj;

//   try {
//     const { stdout: durationOutput } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${savePath}"`);

//     const vidSeconds = parseFloat(durationOutput.trim());

//     return vidSeconds;
//   } catch (e) {
//     console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
//     return null;
//   }
// };

export const calcVidSeconds = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath } = inputObj;

  try {
    const { stdout: durationOutput } = await execFileAsync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", savePath]);

    const vidSeconds = parseFloat(durationOutput.trim());

    return vidSeconds;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

//COMMAND INJECTION
// export const buildChunkCommand = async (inputObj) => {
//   if (!inputObj) return null;
//   const { savePath, startTime, chunkSeconds, chunkPath } = inputObj;

//   try {
//     const command = `ffmpeg -i "${savePath}" -ss ${startTime} -t ${chunkSeconds} -c copy -avoid_negative_ts make_zero "${chunkPath}"`;
//     console.log(`Creating ${chunkPath}...`);

//     return command;
//   } catch (e) {
//     console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
//     return null;
//   }
// };

export const buildChunkCommand = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath, startTime, chunkSeconds, chunkPath } = inputObj;

  try {
    // Return command and args as an object
    const commandObj = {
      command: "ffmpeg",
      args: ["-i", savePath, "-ss", String(startTime), "-t", String(chunkSeconds), "-c", "copy", "-avoid_negative_ts", "make_zero", chunkPath],
    };

    console.log(`Creating ${chunkPath}...`);
    return commandObj;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

//---------------------

export const deleteVidChunks = async (inputArray) => {
  console.log("DELETE VIDS INPUT ARRAY");
  console.log(inputArray);

  for (let i = 0; i < inputArray.length; i++) {
    if (!kcnaState.scrapeActive) return true;

    try {
      const chunk = inputArray[i];
      const { chunkPath } = chunk;
      const chunkExists = fs.existsSync(chunkPath);
      if (!chunkExists) continue;

      fs.unlinkSync(chunkPath);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
      continue;
    }
  }

  return true;
};
