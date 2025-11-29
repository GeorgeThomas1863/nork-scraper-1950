import kcnaState from "./state.js";
import dbModel from "../../models/db-model.js";
import CONFIG from "../../config/config.js";
import { resetStateKCNA } from "./state.js";

export const logScrapeStartKCNA = async () => {
  const { log } = CONFIG;

  //RESET FIRST
  await resetStateKCNA();
  // await stopWatchdog();

  //set scrape active
  kcnaState.scrapeActive = true;
  const newScrapeStartTime = new Date();

  console.log("STARTING NEW KCNA SCRAPE AT " + newScrapeStartTime);

  //create scrapeId
  const startModel = new dbModel({ scrapeStartTime: newScrapeStartTime }, log);
  const startData = await startModel.storeAny();

  const newScrapeId = startData.insertedId?.toString() || null;
  console.log("NEW SCRAPE ID");
  console.log(newScrapeId);

  kcnaState.scrapeId = newScrapeId;

  //add it to the the log (so can look up everything else by scrapeId)
  const logModel = new dbModel({ keyToLookup: "_id", itemValue: startData.insertedId, updateObj: kcnaState }, log);
  const logData = await logModel.updateObjItem();
  console.log("LOG DATA");
  console.log(logData);

  kcnaState.scrapeEndTime = null;
  kcnaState.scrapeStartTime = newScrapeStartTime;
  kcnaState.scrapeActive = true;
  kcnaState.scrapeStep = "ARTICLE URLS KCNA";
  kcnaState.scrapeMessage = "STARTING NEW SCRAPE KCNA";

  await updateLogKCNA();

  return kcnaState;
};

export const logScrapeStopKCNA = async () => {
  const scrapeEndTime = new Date();
  const scrapeLengthSeconds = (scrapeEndTime - kcnaState.scrapeStartTime) / 1000;
  const scrapeLengthMinutes = Math.floor(scrapeLengthSeconds / 60);

  kcnaState.scrapeEndTime = scrapeEndTime;
  kcnaState.scrapeLengthSeconds = scrapeLengthSeconds;
  kcnaState.scrapeLengthMinutes = scrapeLengthMinutes;
  kcnaState.scrapeStep = "FINISHED SCRAPE KCNA";
  kcnaState.scrapeMessage = "FINISHED SCRAPE KCNA";
  kcnaState.scrapeActive = false;

  console.log("LOGGING SCRAPE STOP KCNA");
  console.log("FINISHED KCNA SCRAPE AT " + scrapeEndTime);
  console.log(`SCRAPE LENGTH: ${scrapeLengthMinutes} minutes and ${(scrapeLengthSeconds % 60).toFixed(2)} seconds`);

  await updateLogKCNA();
  await resetStateKCNA();

  // await stopWatchdog();

  return kcnaState;
};

export const updateLogKCNA = async () => {
  if (!kcnaState.scrapeId) return null;
  const { log } = CONFIG;

  const updateModel = new dbModel({ keyToLookup: "scrapeId", itemValue: kcnaState.scrapeId, updateObj: kcnaState }, log);
  const updateData = await updateModel.updateObjItem();

  return updateData;
};
