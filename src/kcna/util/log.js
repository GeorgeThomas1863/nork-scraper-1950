import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "./state.js";
import { resetStateKCNA } from "./state.js";
// import { updateWatchdog, runWatchdog, stopWatchdog } from "./watchdog.js";

export const logScrapeStartKCNA = async () => {
  const { log } = CONFIG;

  //RESET FIRST
  await resetStateKCNA();
  // await stopWatchdog();

  //set scrape active
  kcnaState.scrapeActive = true;
  const newScrapeStartTime = new Date();

  console.log("STARTING NEW KCNA SCRAPE AT " + newScrapeStartTime);

  try {
    //create scrapeId
    const startModel = new dbModel({ scrapeStartTime: newScrapeStartTime }, log);
    const startData = await startModel.storeAny();

    console.log("LOG SCAPE START DATA");
    console.log(startData);

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

    await updateLogKCNA(kcnaState);
    return true;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
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

  console.log("FINISHED KCNA SCRAPE AT " + scrapeEndTime);
  console.log(`SCRAPE LENGTH: ${scrapeLengthMinutes} minutes and ${(scrapeLengthSeconds % 60).toFixed(2)} seconds`);

  await updateLogKCNA(kcnaState);
  await resetStateKCNA();

  // await stopWatchdog();

  return true;
};

//ALSO UPDATES WATCHDOG
export const updateLogKCNA = async () => {
  if (!kcnaState.scrapeId) return null;
  const { log } = CONFIG;

  // await updateWatchdog();

  // console.log("UPDATE LOG KCNA");
  // console.log(kcnaState);

  try {
    //avoid storing intervalIds (causes error)
    // const { intervalId: _, watchdogIntervalId: __, ...storeObj } = kcnaState;
    // const { intervalId: _, ...storeObj } = kcnaState;
    const updateModel = new dbModel({ keyToLookup: "scrapeId", itemValue: kcnaState.scrapeId, updateObj: kcnaState }, log);
    const updateData = await updateModel.updateObjItem();

    console.log("UPDATE DATA");
    console.log(updateData);

    return updateData;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};
