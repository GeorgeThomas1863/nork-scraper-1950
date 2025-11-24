import kcnaState from "./state.js";
import dbModel from "../../models/db-model.js";
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

    await updateLogKCNA();

    return kcnaState;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const updateLogKCNA = async () => {
  if (!kcnaState.scrapeId) return null;
  const { log } = CONFIG;

  try {
    const updateModel = new dbModel({ keyToLookup: "scrapeId", itemValue: kcnaState.scrapeId, updateObj: kcnaState }, log);
    const updateData = await updateModel.updateObjItem();

    return updateData;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};
