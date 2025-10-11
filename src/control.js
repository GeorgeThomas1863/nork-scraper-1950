import axios from "axios";

import CONFIG from "../config/config.js";
import kcnaState from "./kcna/util/state.js";
import { scrapeKCNA } from "./kcna/kcna-control.js";

export const handleIncomingAPI = async (inputParams) => {
  const { command } = inputParams;

  try {
    switch (command) {
      case "admin-start-scrape":
        return await runNewScrape(inputParams);

      case "admin-stop-scrape":
        return await runStopScrape(inputParams);

      default:
        return null;
    }
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

//check which site should be targeted
export const runNewScrape = async (inputParams) => {
  const { site } = inputParams;

  switch (site) {
    case "kcna":
      if (kcnaState.scrapeActive) {
        return { data: "ALREADY SCRAPING FAGGOT" };
      }
      return await scrapeKCNA();

    case "watch":
      return await scrapeWatch();

    default:
      return null;
  }
};

export const runStopScrape = async (inputParams) => {
  const { site } = inputParams;

  switch (site) {
    case "kcna":
      kcnaState.scrapeActive = false;
      return { data: "STOPPING KCNA SCRAPE" };

    default:
      return null;
  }
};

export const scrapeWatch = async () => {};
