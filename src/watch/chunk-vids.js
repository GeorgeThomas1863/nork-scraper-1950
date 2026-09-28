import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

// Telegram says 50 MB without stating MB vs MiB; use the smaller decimal figure
export const TG_VID_MAX_BYTES = 50_000_000;

//splits savePath into pieces under TG_VID_MAX_BYTES via ffmpeg stream copy (no re-encode);
//returns [savePath] untouched when already small enough, an array of absolute chunk paths
//in play order otherwise, or null on failure
export const buildVidChunks = async (savePath, chunkDir, baseName) => {
  if (!savePath || !chunkDir || !baseName) return null;

  const sourceExists = checkFileExists(savePath);
  if (!sourceExists) {
    console.log(`CHUNK SOURCE FILE MISSING: ${savePath}`);
    return null;
  }

  const dirReady = ensureChunkDir(chunkDir);
  if (!dirReady) return null;

  const sourceSize = getFileSize(savePath);
  if (sourceSize === null) return null;

  if (sourceSize < TG_VID_MAX_BYTES) return [savePath];

  const duration = await getVidDuration(savePath);
  if (!duration) return null;

  const targetBytes = parseInt(process.env.TG_VID_CHUNK_BYTES) || 40_000_000;
  const segmentSeconds = computeSegmentSeconds(duration, sourceSize, targetBytes);

  const chunkPathArray = await splitIntoChunks(savePath, chunkDir, baseName, segmentSeconds);
  if (!chunkPathArray) return null;

  if (!hasOversizedChunk(chunkPathArray)) return chunkPathArray;

  console.log(`OVERSIZED CHUNK, RETRYING WITH HALVED SEGMENT TIME: ${baseName}`);
  removeVidChunks(chunkPathArray, savePath);

  const retrySeconds = Math.max(30, Math.floor(segmentSeconds / 2));
  const retryChunkPathArray = await splitIntoChunks(savePath, chunkDir, baseName, retrySeconds);
  if (!retryChunkPathArray) return null;

  if (hasOversizedChunk(retryChunkPathArray)) {
    console.log(`CHUNKS STILL OVERSIZED AFTER RETRY: ${baseName}`);
    removeVidChunks(retryChunkPathArray, savePath);
    return null;
  }

  return retryChunkPathArray;
};

const checkFileExists = (savePath) => {
  try {
    return fs.existsSync(savePath);
  } catch (e) {
    console.log(`FAILED TO CHECK SOURCE FILE: ${savePath} | ${e.message}`);
    return false;
  }
};

const ensureChunkDir = (chunkDir) => {
  try {
    fs.mkdirSync(chunkDir, { recursive: true });
    return true;
  } catch (e) {
    console.log(`FAILED TO CREATE CHUNK DIR: ${chunkDir} | ${e.message}`);
    return false;
  }
};

const getFileSize = (savePath) => {
  try {
    return fs.statSync(savePath).size;
  } catch (e) {
    console.log(`FAILED TO STAT FILE: ${savePath} | ${e.message}`);
    return null;
  }
};

const getVidDuration = async (savePath) => {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      savePath,
    ]);

    const duration = parseFloat(stdout);
    if (!duration) throw new Error(`unparseable duration output: ${String(stdout).trim()}`);

    return duration;
  } catch (e) {
    console.log(`FFPROBE DURATION ERROR: ${savePath} | ${e.message}`);
    return null;
  }
};

const computeSegmentSeconds = (duration, sourceSize, targetBytes) => {
  const rawSeconds = Math.floor((duration * targetBytes) / sourceSize);
  return Math.max(30, rawSeconds);
};

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getChunkIndex = (name) => {
  const match = name.match(/_p(\d+)\.mp4$/);
  return match ? parseInt(match[1], 10) : 0;
};

const listChunkPaths = (chunkDir, baseName) => {
  try {
    const chunkNamePattern = new RegExp(`^${escapeRegExp(baseName)}_p\\d+\\.mp4$`);
    const allNameArray = fs.readdirSync(chunkDir);

    const matchNameArray = [];
    for (const name of allNameArray) {
      if (chunkNamePattern.test(name)) matchNameArray.push(name);
    }

    matchNameArray.sort((a, b) => getChunkIndex(a) - getChunkIndex(b));

    const chunkPathArray = [];
    for (const name of matchNameArray) {
      chunkPathArray.push(path.join(chunkDir, name));
    }

    return chunkPathArray;
  } catch (e) {
    console.log(`FAILED TO LIST CHUNK DIR: ${chunkDir} | ${e.message}`);
    return [];
  }
};

const removeStaleChunks = (chunkDir, baseName) => {
  const staleChunkArray = listChunkPaths(chunkDir, baseName);
  removeVidChunks(staleChunkArray, null);
};

const splitIntoChunks = async (savePath, chunkDir, baseName, segmentSeconds) => {
  removeStaleChunks(chunkDir, baseName);

  const outputPattern = path.join(chunkDir, `${baseName}_p%02d.mp4`);

  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      savePath,
      "-map",
      "0",
      "-c",
      "copy",
      "-f",
      "segment",
      "-segment_time",
      String(segmentSeconds),
      "-reset_timestamps",
      "1",
      "-segment_format_options",
      "movflags=+faststart",
      outputPattern,
    ]);
  } catch (e) {
    console.log(`FFMPEG SEGMENT SPLIT ERROR: ${baseName} | ${e.message}`);
    return null;
  }

  const chunkPathArray = listChunkPaths(chunkDir, baseName);
  if (!chunkPathArray.length) {
    console.log(`NO CHUNKS PRODUCED: ${baseName}`);
    return null;
  }

  return chunkPathArray;
};

const hasOversizedChunk = (chunkPathArray) => {
  for (const chunkPath of chunkPathArray) {
    const size = getFileSize(chunkPath);
    if (size === null || size >= TG_VID_MAX_BYTES) return true;
  }

  return false;
};

//++++++++++++++++++++++++++++++++++++++++++

//deletes each chunk with fs.rmSync force; never throws; skips keepPath (the original video)
export const removeVidChunks = (chunkPathArray, keepPath) => {
  if (!chunkPathArray || !chunkPathArray.length) return;

  for (const chunkPath of chunkPathArray) {
    if (chunkPath === keepPath) continue;

    try {
      fs.rmSync(chunkPath, { force: true });
    } catch (e) {
      console.log(`FAILED TO REMOVE CHUNK: ${chunkPath} | ${e.message}`);
    }
  }
};
