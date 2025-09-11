import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

export const kcnaState = {
  scrapeId: null,
  scrapeActive: false,
  schedulerActive: false,

  scrapeStartTime: null,
  scrapeEndTime: null,
};

export const logScrapeStartKCNA = async () => {
  const { log } = CONFIG;

  //set scrape active
  kcnaState.scrapeActive = true;

  const newScrapeStartTime = new Date();

  console.log("STARTING NEW KCNA SCRAPE AT " + newScrapeStartTime);
  const startModel = new dbModel({ scrapeStartTime: newScrapeStartTime }, log);
  const startData = await startModel.storeAny();
  console.log("START DATA");
  console.log(startData);

  const newScrapeId = startData.insertedId?.toString() || null;

  kcnaState.scrapeId = newScrapeId;
  kcnaState.scrapeEndTime = null;
  kcnaState.scrapeStartTime = newScrapeStartTime;

  //update the log
  const updateModel = new dbModel({ keyToLookup: "scrapeStartTime", itemValue: newScrapeStartTime, updateObj: kcnaState }, log);
  const updateData = await updateModel.updateObjItem();
  console.log("UPDATE DATA");
  console.log(updateData);

  console.log("KCNA STATE");
  console.log(kcnaState);
  return true;
};


export const logScrapeStopKCNA = async () => {}