import CONFIG from "../../config/config.js";
import kcnaState from "./state.js";
import { scrapeKCNA } from "../kcna/scrape-kcna.js";

// Store intervalId at module level instead of in state (fucked in state)
let intervalId = null;

export const startSchedulerKCNA = async () => {
  const { scrapeInterval } = CONFIG;
  kcnaState.schedulerActive = true;

  //NEEDS MORE DEBUGGING
  // const testInterval = 5 * 1000; //5 seconds
  console.log("STARTING SCHEDULER");
  console.log(new Date().toISOString());

  //RUN IMMEDIATELY ON START
  if (!kcnaState.scrapeActive) {
    console.log("STARTING INITIAL SCRAPE");
    await scrapeKCNA();
  }

  intervalId = setInterval(async () => {
    if (kcnaState.scrapeActive) return null;

    console.log("STARTING NEW SCRAPE");
    await scrapeKCNA();
  }, scrapeInterval); //RESET

  return true;
};

export const stopSchedulerKCNA = async () => {
  if (!intervalId) return null;

  console.log("STOPPING SCHEDULER AT:");
  console.log(new Date().toISOString());

  clearInterval(intervalId);
  intervalId = null;
  kcnaState.schedulerActive = false;

  return true;
};
