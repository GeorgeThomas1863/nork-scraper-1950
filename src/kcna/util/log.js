import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "./state.js";
import { resetStateKCNA } from "./state.js";

export const logScrapeStartKCNA = async (displayerId = null) => {
  const { log } = CONFIG;

  //set if displayerId provided
  if (displayerId) kcnaState.displayerId = displayerId;

  //set scrape active
  kcnaState.scrapeActive = true;
  const newScrapeStartTime = new Date();

  console.log("STARTING NEW KCNA SCRAPE AT " + newScrapeStartTime);

  try {
    //create scrapeId
    const startModel = new dbModel({ scrapeStartTime: newScrapeStartTime }, log);
    const startData = await startModel.storeAny();
    console.log("START DATA");
    console.log(startData);

    const newScrapeId = startData.insertedId?.toString() || null;
    kcnaState.scrapeId = newScrapeId;
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

  console.log("FINISHED KCNA SCRAPE AT " + scrapeEndTime);
  console.log(`SCRAPE LENGTH: ${scrapeLengthMinutes} minutes and ${(scrapeLengthSeconds % 60).toFixed(2)} seconds`);

  await updateLogKCNA(kcnaState);
  await resetStateKCNA();

  return true;
};

//state as input params
export const updateLogKCNA = async () => {
  if (!kcnaState.scrapeId) return null;
  const { log } = CONFIG;

  try {
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
