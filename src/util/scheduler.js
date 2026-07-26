import kcnaState from "./state.js";
import dbModel from "../../models/db-model.js";
import { scrapeKCNA } from "../kcna/scrape-kcna.js";

const SCHEDULER_CONFIG_KEY = "schedulerState";

let intervalId = null;
let schedulerGeneration = 0;

export const startSchedulerKCNA = async () => {
  const ownedGeneration = claimSchedulerOwnership();
  const scrapeInterval = parseInt(process.env.SCRAPE_INTERVAL);

  logSchedulerStart();
  await persistSchedulerState(true);

  if (!ownsScheduler(ownedGeneration)) return null;

  intervalId = setInterval(() => {
    runScheduledScrape(ownedGeneration);
  }, scrapeInterval);

  startInitialScrape();

  return true;
};

const claimSchedulerOwnership = () => {
  schedulerGeneration += 1;
  kcnaState.schedulerActive = true;
  return schedulerGeneration;
};

const logSchedulerStart = () => {
  console.log("STARTING SCHEDULER");
  console.log(new Date().toISOString());
};

//runs unawaited so the admin request returns before the scrape finishes
const startInitialScrape = () => {
  if (kcnaState.scrapeActive || kcnaState.scrapeRunning) return null;

  console.log("STARTING INITIAL SCRAPE");

  return scrapeKCNA({ howMuch: "admin-scrape-new" }).catch((error) => {
    console.log("INITIAL SCRAPE ERROR: " + error.message);
    return null;
  });
};

const runScheduledScrape = async (ownedGeneration) => {
  if (!ownsScheduler(ownedGeneration)) return null;
  if (kcnaState.scrapeActive || kcnaState.scrapeRunning) return null;

  console.log("STARTING NEW SCRAPE");

  try {
    return await scrapeKCNA({ howMuch: "admin-scrape-new" });
  } catch (error) {
    console.log("SCHEDULED SCRAPE ERROR: " + error.message);
    return null;
  }
};

const ownsScheduler = (ownedGeneration) => {
  return kcnaState.schedulerActive && schedulerGeneration === ownedGeneration;
};

export const stopSchedulerKCNA = async () => {
  if (!kcnaState.schedulerActive && !intervalId) return null;

  console.log("STOPPING SCHEDULER AT:");
  console.log(new Date().toISOString());

  schedulerGeneration += 1;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  kcnaState.schedulerActive = false;

  await persistSchedulerState(false);

  return true;
};

export const resumeSchedulerKCNA = async () => {
  const savedState = await readSchedulerState();

  if (!savedState) return null;
  if (!savedState.schedulerOn) return null;

  console.log("RESUMING SCHEDULER FROM SAVED STATE");
  return await startSchedulerKCNA();
};

//---

const persistSchedulerState = async (schedulerOn) => {
  const log = process.env.LOG_COLLECTION;

  try {
    const lookupModel = new dbModel(buildSchedulerLookup(), log);
    const existingState = await lookupModel.getUniqueItem();

    if (!existingState) return await storeSchedulerState(schedulerOn);
    return await updateSchedulerState(schedulerOn);
  } catch (error) {
    console.log("SCHEDULER STATE PERSIST ERROR: " + error.message);
    return null;
  }
};

const storeSchedulerState = async (schedulerOn) => {
  const log = process.env.LOG_COLLECTION;
  const stateDoc = { configKey: SCHEDULER_CONFIG_KEY, schedulerOn, updatedAt: new Date() };
  const storeModel = new dbModel(stateDoc, log);
  return await storeModel.storeAny();
};

const updateSchedulerState = async (schedulerOn) => {
  const log = process.env.LOG_COLLECTION;
  const updateObj = { schedulerOn, updatedAt: new Date() };
  const updateModel = new dbModel({ ...buildSchedulerLookup(), updateObj }, log);
  return await updateModel.updateObjItem();
};

const readSchedulerState = async () => {
  const log = process.env.LOG_COLLECTION;

  try {
    const stateModel = new dbModel(buildSchedulerLookup(), log);
    return await stateModel.getUniqueItem();
  } catch (error) {
    console.log("SCHEDULER STATE READ ERROR: " + error.message);
    return null;
  }
};

const buildSchedulerLookup = () => {
  return { keyToLookup: "configKey", itemValue: SCHEDULER_CONFIG_KEY };
};
