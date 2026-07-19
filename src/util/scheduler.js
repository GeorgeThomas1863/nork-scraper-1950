import kcnaState from "./state.js";
import { scrapeKCNA } from "../kcna/scrape-kcna.js";

let intervalId = null;
let schedulerGeneration = 0;

export const startSchedulerKCNA = async () => {
  const ownedGeneration = claimSchedulerOwnership();
  const scrapeInterval = parseInt(process.env.SCRAPE_INTERVAL);

  logSchedulerStart();

  try {
    await runInitialScrape();
  } catch (error) {
    releaseSchedulerOwnership(ownedGeneration);
    throw error;
  }

  if (!ownsScheduler(ownedGeneration)) return null;

  intervalId = setInterval(() => {
    runScheduledScrape(ownedGeneration);
  }, scrapeInterval);

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

const runInitialScrape = async () => {
  if (kcnaState.scrapeActive || kcnaState.scrapeRunning) return null;

  console.log("STARTING INITIAL SCRAPE");
  return await scrapeKCNA({ howMuch: "admin-scrape-new" });
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

const releaseSchedulerOwnership = (ownedGeneration) => {
  if (!ownsScheduler(ownedGeneration)) return;
  kcnaState.schedulerActive = false;
};

export const stopSchedulerKCNA = async () => {
  if (!kcnaState.schedulerActive && !intervalId) return null;

  console.log("STOPPING SCHEDULER AT:");
  console.log(new Date().toISOString());

  schedulerGeneration += 1;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  kcnaState.schedulerActive = false;

  return true;
};
