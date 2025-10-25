import CONFIG from "../../../config/config.js";
import kcnaState from "./state.js";
import { scrapeKCNA } from "../scrape-kcna.js";

export const startSchedulerKCNA = async () => {
  const { scrapeInterval } = CONFIG;

  // const testInterval = 10000;

  console.log("STARTING SCHEDULER");
  console.log(new Date().toISOString());

  const intervalId = setInterval(async () => {
    if (kcnaState.scrapeActive) return null;

    console.log("STARTING NEW SCRAPE");
    await scrapeKCNA();
  }, scrapeInterval); //RESET

  kcnaState.intervalId = intervalId;
  kcnaState.schedulerActive = true;
  return true;
};

export const stopSchedulerKCNA = async () => {
  if (!kcnaState.intervalId) return null;

  console.log("STOPPING SCHEDULER AT:");
  console.log(new Date().toISOString());

  clearInterval(kcnaState.intervalId);
  kcnaState.intervalId = null;
  kcnaState.schedulerActive = false;

  return true;
};
