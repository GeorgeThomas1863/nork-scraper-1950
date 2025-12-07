import kcnaState from "./util/state.js";
import { resetScrapeMessageKCNA } from "./util/state.js";
import { scrapeKCNA } from "./kcna/scrape-kcna.js";
import { startSchedulerKCNA, stopSchedulerKCNA } from "./util/scheduler.js";
import { logScrapeStopKCNA } from "./util/log.js";

export const runScraper = async (inputParams) => {
  const { command } = inputParams;

  switch (command) {
    case "admin-start-scrape":
      // await resetScrapeMessageKCNA();
      if (kcnaState.scrapeActive) {
        kcnaState.scrapeMessage = "ALREADY SCRAPING FAGGOT";
        return kcnaState;
      }
      kcnaState.scrapeActive = true;
      kcnaState.scrapeMessage = "STARTING NEW SCRAPE KCNA";
      return await scrapeKCNA(inputParams);

    case "admin-stop-scrape":
      if (!kcnaState.scrapeActive) {
        kcnaState.scrapeMessage = "NOT SCRAPING FAGGOT";
        return kcnaState;
      }
      kcnaState.scrapeActive = false; //immediately stop
      await logScrapeStopKCNA();
      return kcnaState;

    case "admin-start-scheduler":
      // await resetScrapeMessageKCNA();
      if (kcnaState.schedulerActive) {
        kcnaState.scrapeMessage = "SCHEDULER ALREADY ON FAGGOT";
        return kcnaState;
      }
      kcnaState.schedulerActive = true;
      kcnaState.scrapeMessage = "STARTING NEW SCHEDULER KCNA";
      return await startSchedulerKCNA();

    case "admin-stop-scheduler":
      if (!kcnaState.schedulerActive) {
        kcnaState.scrapeMessage = "SCHEDULER NOT ON FAGGOT";
        return kcnaState;
      }
      kcnaState.schedulerActive = false;
      return await stopSchedulerKCNA();

    case "admin-scrape-status":
      kcnaState.scrapeMessage = "GETTING SCRAPE STATUS KCNA";
      return kcnaState;

    default:
      return null;
  }
};

//check which site should be targeted
// export const runNewScrape = async (inputParams) => {
//   const { site } = inputParams;

//   switch (site) {
//     case "kcna":

//     case "watch":
//       return await scrapeWatch();

//     default:
//       return null;
//   }
// };

// export const runStopScrape = async (inputParams) => {
//   const { site } = inputParams;

//   switch (site) {
//     case "kcna":
//       return { data: "STOPPING KCNA SCRAPE" };

//     default:
//       return null;
//   }
// };

export const scrapeWatch = async () => {};
