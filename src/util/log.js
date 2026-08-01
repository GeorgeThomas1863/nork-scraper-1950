import kcnaState from "./state.js";
import dbModel from "../../models/db-model.js";
import { resetStateKCNA } from "./state.js";

let activeLogId = null;

export const logScrapeStartKCNA = async () => {
  const log = process.env.LOG_COLLECTION;

  resetStateKCNA();
  activeLogId = null;

  const newScrapeStartTime = new Date();
  kcnaState.scrapeStartTime = newScrapeStartTime;
  kcnaState.scrapeActive = true;
  kcnaState.scrapeStep = "ARTICLE URLS KCNA";
  kcnaState.scrapeMessage = "STARTING NEW SCRAPE KCNA";

  console.log("STARTING NEW KCNA SCRAPE AT " + newScrapeStartTime);

  const startModel = new dbModel({ scrapeStartTime: newScrapeStartTime }, log);
  const startData = await startModel.storeAny();
  activeLogId = startData.insertedId;
  kcnaState.scrapeId = activeLogId?.toString() || null;

  console.log("NEW SCRAPE ID: " + kcnaState.scrapeId);

  await updateLogKCNA();

  return kcnaState;
};

export const logScrapeStopKCNA = async (error = null) => {
  if (!kcnaState.scrapeStartTime) return finalizeUnstartedScrape(error);

  const scrapeEndTime = new Date();
  const scrapeLengthSeconds = (scrapeEndTime - kcnaState.scrapeStartTime) / 1000;
  const scrapeLengthMinutes = Math.floor(scrapeLengthSeconds / 60);

  setScrapeTiming(scrapeEndTime, scrapeLengthSeconds, scrapeLengthMinutes);
  setScrapeOutcome(error);
  logScrapeTiming(scrapeEndTime, scrapeLengthSeconds, scrapeLengthMinutes);

  await updateLogKCNA();
  return resetAndReturnFinalState();
};

const finalizeUnstartedScrape = (error) => {
  setScrapeOutcome(error);
  return resetAndReturnFinalState();
};

const setScrapeTiming = (scrapeEndTime, scrapeLengthSeconds, scrapeLengthMinutes) => {
  kcnaState.scrapeEndTime = scrapeEndTime;
  kcnaState.scrapeLengthSeconds = scrapeLengthSeconds;
  kcnaState.scrapeLengthMinutes = scrapeLengthMinutes;
};

const setScrapeOutcome = (error) => {
  const failedStep = kcnaState.scrapeStep || "scrape initialization";
  kcnaState.scrapeActive = false;

  if (!error) {
    kcnaState.scrapeStep = "FINISHED SCRAPE KCNA";
    kcnaState.scrapeMessage = "FINISHED SCRAPE KCNA";
    return;
  }

  kcnaState.scrapeError = error.message;
  kcnaState.scrapeStep = "FAILED SCRAPE KCNA";
  kcnaState.scrapeMessage = `Scrape failed during ${failedStep}`;
};

const logScrapeTiming = (scrapeEndTime, scrapeLengthSeconds, scrapeLengthMinutes) => {
  console.log("LOGGING SCRAPE STOP KCNA");
  console.log("FINISHED KCNA SCRAPE AT " + scrapeEndTime);
  console.log(`SCRAPE LENGTH: ${scrapeLengthMinutes} minutes and ${(scrapeLengthSeconds % 60).toFixed(2)} seconds`);
};

const resetAndReturnFinalState = () => {
  const finalState = { ...kcnaState };
  resetStateKCNA();
  return finalState;
};

export const updateLogKCNA = async () => {
  if (!kcnaState.scrapeId) return null;
  const log = process.env.LOG_COLLECTION;
  const lookup = buildLogLookup();
  const updateModel = new dbModel({ ...lookup, updateObj: kcnaState }, log);
  const updateData = await updateModel.updateObjItem();

  activeLogId = null;
  return updateData;
};

const buildLogLookup = () => {
  if (activeLogId) return { keyToLookup: "_id", itemValue: activeLogId };
  return { keyToLookup: "scrapeId", itemValue: kcnaState.scrapeId };
};

//---

//single-instance process: any log doc still scrapeActive at boot is a dead run
export const closeStaleScrapes = async () => {
  const log = process.env.LOG_COLLECTION;

  const staleUpdate = {
    scrapeActive: false,
    scrapeRunning: false,
    scrapeError: true,
    scrapeStep: "FAILED SCRAPE KCNA",
    scrapeMessage: "SCRAPE INTERRUPTED BY RESTART",
  };

  try {
    const sweepModel = new dbModel({ filterObj: { scrapeActive: true }, updateObj: staleUpdate }, log);
    const sweepData = await sweepModel.updateAllMatching();

    if (sweepData?.modifiedCount) console.log("CLOSED " + sweepData.modifiedCount + " STALE SCRAPE LOG ENTRIES");
    return sweepData;
  } catch (e) {
    console.log("STALE SCRAPE SWEEP ERROR: " + e.message);
    return null;
  }
};
