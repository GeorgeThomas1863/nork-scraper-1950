import dotenv from "dotenv";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { dbClose, dbConnect, dbGet } from "../middleware/db-config.js";

//one time repair: strips download result fields off pic docs stored with picSize 0,
//so the normal scrape pipeline (findEmptyItems on picSize) re-downloads them

const EMPTY_PIC_FILTER = { picSize: 0 };
const UNSET_FIELDS = { picSize: "", picName: "", savePath: "", headers: "" };

const main = async () => {
  loadRepairEnv();

  const execute = parseRepairArgs(process.argv);
  const result = await runRepair({ execute: execute });

  console.log(result.message);
  process.exit(result.success ? 0 : 1);
};

export const parseRepairArgs = (argvArray) => {
  if (!argvArray || !argvArray.length) return false;
  return argvArray.includes("--execute");
};

export const loadRepairEnv = () => {
  const scriptPath = fileURLToPath(import.meta.url);
  const envPath = path.resolve(path.dirname(scriptPath), "..", ".env");
  dotenv.config({ path: envPath });
};

export const runRepair = async (inputObj) => {
  const execute = inputObj?.execute;

  const connectResult = await connectRepairDb();
  if (!connectResult.success) return connectResult;

  const result = execute ? await repairEmptyPicDocs() : await runDryRun();
  await closeRepairDb();

  return result;
};

const connectRepairDb = async () => {
  try {
    await dbConnect();
    console.log(`REPAIR TARGET: db ${process.env.DB_NAME} | collection ${process.env.PICS_COLLECTION}`);
    return { success: true, message: "REPAIR CONNECTED" };
  } catch (e) {
    return { success: false, message: "REPAIR FAILED: could not connect to MongoDB: " + scrubSecrets(e.message) };
  }
};

export const runDryRun = async () => {
  const docArray = await findEmptyPicDocs();
  if (!docArray) return { success: false, message: "DRY RUN FAILED: could not query pic docs" };

  reportEmptyPicDocs(docArray);
  return {
    success: true,
    message: `DRY RUN COMPLETE: ${docArray.length} pic docs WOULD BE repaired; NOTHING WAS MODIFIED (re-run with --execute to repair)`,
    count: docArray.length,
  };
};

export const findEmptyPicDocs = async () => {
  const collection = process.env.PICS_COLLECTION;
  if (!collection) {
    console.log("REPAIR ERROR: PICS_COLLECTION env var not set");
    return null;
  }

  try {
    const docArray = await dbGet().collection(collection).find(EMPTY_PIC_FILTER).toArray();
    return docArray;
  } catch (e) {
    console.log(`REPAIR ERROR: query of empty pic docs in ${collection} failed: ` + scrubSecrets(e.message));
    return null;
  }
};

export const reportEmptyPicDocs = (docArray) => {
  if (!docArray || !docArray.length) {
    console.log("DRY RUN: 0 pic docs match { picSize: 0 }");
    return 0;
  }

  console.log(`DRY RUN: ${docArray.length} pic docs match { picSize: 0 }`);
  for (const picItem of docArray) {
    console.log(`  picId: ${picItem.picId} | url: ${picItem.url}`);
  }

  return docArray.length;
};

export const repairEmptyPicDocs = async () => {
  const collection = process.env.PICS_COLLECTION;
  if (!collection) return { success: false, message: "REPAIR FAILED: PICS_COLLECTION env var not set" };

  try {
    const updateData = await dbGet().collection(collection).updateMany(EMPTY_PIC_FILTER, { $unset: UNSET_FIELDS });
    return {
      success: true,
      message: `REPAIR COMPLETE: matched ${updateData.matchedCount} | modified ${updateData.modifiedCount} pic docs`,
      matchedCount: updateData.matchedCount,
      modifiedCount: updateData.modifiedCount,
    };
  } catch (e) {
    return { success: false, message: `REPAIR FAILED: updateMany on ${collection} errored: ` + scrubSecrets(e.message) };
  }
};

const closeRepairDb = async () => {
  try {
    await dbClose();
  } catch (e) {
    console.log("REPAIR WARNING: could not close MongoDB connection: " + scrubSecrets(e.message));
  }
};

//strip any connection string out of driver error text before logging
const scrubSecrets = (message) => {
  if (!message) return "unknown error";
  return message.replace(/mongodb(\+srv)?:\/\/\S+/gi, "[connection string redacted]");
};

const isCliEntry = () => {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return import.meta.url === pathToFileURL(entryPath).href;
};

if (isCliEntry()) await main();
