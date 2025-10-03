import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";
import { scrapeArticlesKCNA } from "./articles.js";
import { scrapePicSetsKCNA } from "./picSets.js";
import { scrapeVidPagesKCNA } from "./vidPages.js";
import { downloadPicsKCNA, uploadPicsKCNA } from "./pics.js";
import { downloadVidsKCNA, uploadVidsKCNA } from "./vids.js";

export const scrapeKCNA = async () => {
  await logScrapeStartKCNA();

  //URLs
  await scrapeArticlesKCNA();
  await scrapePicSetsKCNA();
  await scrapeVidPagesKCNA();

  //download to server
  await downloadPicsKCNA();
  await downloadVidsKCNA();

  //upload to TG
  await uploadPicsKCNA();
  await uploadVidsKCNA();

  await logScrapeStopKCNA();
};

//-----------------

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

export const logScrapeStopKCNA = async () => {
  //build
};
