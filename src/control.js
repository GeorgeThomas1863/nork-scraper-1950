import axios from "axios";

import CONFIG from "../config/config.js";
import kcnaState from "./kcna/util/state.js";
import { scrapeKCNA } from "./kcna/kcna-control.js";

export const handleIncomingAPI = async (inputParams) => {
  const { command } = inputParams;

  //prob not necessary to track data

  switch (command) {
    case "admin-start-scrape":
      return await runNewScrape(inputParams);

    case "admin-stop-scrape":
      return await runStopScrape(inputParams);

    default:
      return null;
  }
};

export const handleOutgoingAPI = async (inputParams) => {
  const { apiOutgoingRoute } = CONFIG;
  const url = `https://localhost:${apiOutgoingRoute}`;

  const res = await axios.post(url, inputParams);
  console.log("API OUTGOING RESPONSE");
  console.log(res.data);

  return res.data;
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
