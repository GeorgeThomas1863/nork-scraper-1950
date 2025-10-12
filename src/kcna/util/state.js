import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import { updateDisplayerKCNA } from "./api.js";

const kcnaState = {
  source: "scraper",
  scrapeId: null,
  scrapeActive: false,
  schedulerActive: false,

  scrapeStartTime: null,
  scrapeEndTime: null,
  scrapeLengthSeconds: null,
  scrapeLengthMinutes: null,
  scrapeError: null,
  scrapeMessage: null,
  scrapeStep: null,
  scrapeObj: {
    articleList: {
      fatboy: null,
      topNews: null,
      latestNews: null,
      externalNews: null,
      anecdote: null,
      people: null,
    },
    articleContent: {
      fatboy: null,
      topNews: null,
      latestNews: null,
      externalNews: null,
      anecdote: null,
      people: null,
    },
    articleUpload: {
      fatboy: null,
      topNews: null,
      latestNews: null,
      externalNews: null,
      anecdote: null,
      people: null,
    },
    picSetList: null,
    picSetContent: null,
    picSetUpload: null,
    vidPageList: null,
    vidPageContent: null,
    vidPageUpload: null,
    pics: {
      urls: null,
      downloaded: null,
      uploaded: null,
    },
    vids: {
      urls: null,
      downloaded: null,
      uploaded: null,
    },
  },
};

export const logScrapeStartKCNA = async () => {
  const { log } = CONFIG;

  //reset scrape obj
  await resetScrapeObjKCNA();

  //set scrape active
  kcnaState.scrapeActive = true;

  const newScrapeStartTime = new Date();

  console.log("STARTING NEW KCNA SCRAPE AT " + newScrapeStartTime);

  try {
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

    await updateDisplayerKCNA(kcnaState);

    //update the log
    try {
      const updateModel = new dbModel({ keyToLookup: "scrapeStartTime", itemValue: newScrapeStartTime, updateObj: kcnaState }, log);
      const updateData = await updateModel.updateObjItem();
      console.log("UPDATE DATA");
      console.log(updateData);

      console.log("KCNA STATE");
      console.log(kcnaState);
      return true;
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
      return null;
    }
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const logScrapeStopKCNA = async () => {
  const { log } = CONFIG;

  const scrapeEndTime = new Date();
  const scrapeLengthSeconds = (scrapeEndTime - kcnaState.scrapeStartTime) / 1000;
  const scrapeLengthMinutes = Math.floor(scrapeLengthSeconds / 60);

  kcnaState.scrapeEndTime = scrapeEndTime;
  kcnaState.scrapeLengthSeconds = scrapeLengthSeconds;
  kcnaState.scrapeLengthMinutes = scrapeLengthMinutes;
  kcnaState.scrapeActive = false;
  kcnaState.scrapeStep = "FINISHED SCRAPE KCNA";
  kcnaState.scrapeMessage = "FINISHED SCRAPE KCNA";
  await updateDisplayerKCNA(kcnaState);

  try {
    const updateModel = new dbModel({ keyToLookup: "scrapeId", itemValue: kcnaState.scrapeId, updateObj: kcnaState }, log);
    const updateData = await updateModel.updateObjItem();
    console.log("UPDATE DATA");
    console.log(updateData);

    console.log("KCNA STATE");
    console.log(kcnaState);

    console.log("FINISHED KCNA SCRAPE AT " + scrapeEndTime);
    console.log(`SCRAPE LENGTH: ${scrapeLengthMinutes} minutes and ${(scrapeLengthSeconds % 60).toFixed(2)} seconds`);
    return true;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const resetScrapeObjKCNA = async () => {
  kcnaState.scrapeObj = {
    articleList: {
      fatboy: null,
      topNews: null,
      latestNews: null,
      externalNews: null,
      anecdote: null,
      people: null,
    },
    articleContent: {
      fatboy: null,
      topNews: null,
      latestNews: null,
      externalNews: null,
      anecdote: null,
      people: null,
    },
    articleUpload: {
      fatboy: null,
      topNews: null,
      latestNews: null,
      externalNews: null,
      anecdote: null,
      people: null,
    },
    picSetList: null,
    picSetContent: null,
    picSetUpload: null,
    vidPageList: null,
    vidPageContent: null,
    vidPageUpload: null,
    pics: {
      urls: null,
      downloaded: null,
      uploaded: null,
    },
    vids: {
      urls: null,
      downloaded: null,
      uploaded: null,
    },
  };

  return true;
};

export default kcnaState;
