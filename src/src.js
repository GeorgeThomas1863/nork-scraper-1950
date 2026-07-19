import kcnaState from "./util/state.js";
import { scrapeKCNA } from "./kcna/scrape-kcna.js";
import { startSchedulerKCNA, stopSchedulerKCNA } from "./util/scheduler.js";

export const runScraper = async (inputParams) => {
  const { command } = inputParams;

  switch (command) {
    case "admin-start-scrape":
      if (kcnaState.scrapeRunning) {
        kcnaState.scrapeMessage = buildRunningScrapeMessage();
        return kcnaState;
      }
      return await scrapeKCNA(inputParams);

    case "admin-stop-scrape":
      if (!kcnaState.scrapeActive) {
        kcnaState.scrapeMessage = "No scrape in progress";
        return kcnaState;
      }
      kcnaState.scrapeActive = false; //request cancellation
      kcnaState.scrapeMessage = "STOPPING SCRAPE KCNA";
      return kcnaState;

    case "admin-start-scheduler":
      if (kcnaState.schedulerActive) {
        kcnaState.scrapeMessage = "Scheduler already running";
        return kcnaState;
      }
      kcnaState.schedulerActive = true;
      kcnaState.scrapeMessage = "STARTING NEW SCHEDULER KCNA";
      await startSchedulerKCNA();
      return kcnaState;

    case "admin-stop-scheduler":
      if (!kcnaState.schedulerActive) {
        kcnaState.scrapeMessage = "Scheduler is not running";
        return kcnaState;
      }
      kcnaState.schedulerActive = false;
      kcnaState.scrapeMessage = "STOPPING SCHEDULER KCNA";
      await stopSchedulerKCNA();
      return kcnaState;

    case "admin-scrape-status":
      return kcnaState;

    default:
      return null;
  }
};

const buildRunningScrapeMessage = () => {
  if (!kcnaState.scrapeActive) return "Scrape cancellation is still finalizing";
  return "Scrape already in progress";
};
