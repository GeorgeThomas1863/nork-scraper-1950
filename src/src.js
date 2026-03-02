import kcnaState from "./util/state.js";
import { scrapeKCNA } from "./kcna/scrape-kcna.js";
import { startSchedulerKCNA, stopSchedulerKCNA } from "./util/scheduler.js";
import { logScrapeStopKCNA } from "./util/log.js";

export const runScraper = async (inputParams) => {
  const { command } = inputParams;

  switch (command) {
    case "admin-start-scrape":
      if (kcnaState.scrapeActive) {
        kcnaState.scrapeMessage = "Scrape already in progress";
        return kcnaState;
      }
      return await scrapeKCNA(inputParams);

    case "admin-stop-scrape":
      if (!kcnaState.scrapeActive) {
        kcnaState.scrapeMessage = "No scrape in progress";
        return kcnaState;
      }
      kcnaState.scrapeActive = false; //immediately stop
      kcnaState.scrapeMessage = "STOPPING SCRAPE KCNA";
      await logScrapeStopKCNA();
      return kcnaState;

    case "admin-start-scheduler":
      if (kcnaState.schedulerActive) {
        kcnaState.scrapeMessage = "Scheduler already running";
        return kcnaState;
      }
      kcnaState.schedulerActive = true;
      kcnaState.scrapeMessage = "STARTING NEW SCHEDULER KCNA";
      return await startSchedulerKCNA();

    case "admin-stop-scheduler":
      if (!kcnaState.schedulerActive) {
        kcnaState.scrapeMessage = "Scheduler is not running";
        return kcnaState;
      }
      kcnaState.schedulerActive = false;
      kcnaState.scrapeMessage = "STOPPING SCHEDULER KCNA";
      return await stopSchedulerKCNA();

    case "admin-scrape-status":
      return kcnaState;

    default:
      return null;
  }
};
