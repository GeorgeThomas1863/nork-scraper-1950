import kcnaState from "./util/state.js";
import { scrapeKCNA } from "./kcna/scrape-kcna.js";
// import { startSchedulerKCNA, stopSchedulerKCNA } from "./util/scheduler.js";
// import { logScrapeStopKCNA } from "./util/log.js";
// import { stopWatchdog } from "./kcna/util/watchdog.js";

export const runScraper = async (inputParams) => {
  const { command } = inputParams;

  try {
    switch (command) {
      case "admin-start-scrape":
        return await runNewScrape(inputParams);

      case "admin-stop-scrape":
        return await runStopScrape(inputParams);

      case "admin-start-scheduler":
        return await runStartScheduler(inputParams);

      case "admin-stop-scheduler":
        return await runStopScheduler(inputParams);

      case "admin-scrape-status":
        return kcnaState;

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
      if (kcnaState.scrapeActive) return { data: "ALREADY SCRAPING FAGGOT" };
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
      //turns off scraper and resets state, kill watchdog first
      // await stopWatchdog();
      await logScrapeStopKCNA();
      return { data: "STOPPING KCNA SCRAPE" };

    default:
      return null;
  }
};

export const runStartScheduler = async (inputParams) => {
  const { site } = inputParams;

  // console.log("AHHHHHHHHHHHHHHHHHHHH");

  switch (site) {
    case "kcna":
      if (kcnaState.schedulerActive) return { data: "SCHEDULER ALREADY ACTIVE" };
      return await startSchedulerKCNA();

    default:
      return null;
  }
};

export const runStopScheduler = async (inputParams) => {
  const { site } = inputParams;

  switch (site) {
    case "kcna":
      if (!kcnaState.schedulerActive) return { data: "SCHEDULER NOT ACTIVE" };
      return await stopSchedulerKCNA();

    default:
      return null;
  }
};

export const scrapeWatch = async () => {};
