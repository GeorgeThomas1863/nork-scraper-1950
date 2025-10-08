import { exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";

const execAsync = promisify(exec);

export const chunkVidFS = async (inputObj) => {
  if (!inputObj) return null;
  const { vidData } = inputObj;
  const { vidId, vidSize } = vidData;
  const { tmpPath, uploadVidChunkSize } = CONFIG;

  const vidSeconds = await calcVidSeconds(vidData);

  console.log("VID SECONDS");
  console.log(vidSeconds);

  //   const totalChunks = Math.ceil(vidSize / uploadVidChunkSize);
  //   const chunkPath = path.join(tmpPath, `${vidId}_chunk_%d.mp4`);

  //   const chunkObj = { ...vidData, tmpDir: tmpPath, chunkPath: chunkPath, totalChunks: totalChunks, uploadVidChunkSize: uploadVidChunkSize };

  //   const commandData = await runChunkCommand(chunkObj);
  //   console.log("COMMAND DATA");
  //   console.log(commandData);

  //   const chunkArray = await buildChunkArray(chunkObj);
  //   console.log("CHUNK ARRAY");
  //   console.log(chunkArray);

  // return chunkArray;
};

export const calcVidSeconds = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath } = inputObj;

  const { stdout: durationOutput } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${savePath}"`);

  const vidSeconds = parseFloat(durationOutput.trim());

  return vidSeconds;
};

export const runChunkCommand = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath, chunkPath, totalChunks, uploadVidChunkSize } = inputObj;

  const command = `ffmpeg -i "${savePath}" -c copy -map 0 -f segment -segment_size ${uploadVidChunkSize} -reset_timestamps 1 -break_non_keyframes 1 "${chunkPath}"`;
  console.log(`Chunking video into ${totalChunks} 10MB segments...`);
  const commandData = await execAsync(command);

  return commandData;
};

export const buildChunkArray = async (inputObj) => {
  if (!inputObj) return null;
  const { tmpDir, chunkPath, totalChunks } = inputObj;

  const fileArray = await readdir(tmpDir);
  if (!fileArray || !fileArray.length) return null;

  //prob not needed
  const sortArray = fileArray.filter((chunk) => chunk.startsWith(chunkPath) && chunk.endsWith(".mp4")).sort();

  const chunkArray = [];
  for (let i = 0; i < sortArray.length; i++) {
    const chunkPath = path.join(tmpDir, sortArray[i]);
    if (!chunkPath) continue;
    chunkArray.push(chunkPath);
  }

  return chunkArray;
};
