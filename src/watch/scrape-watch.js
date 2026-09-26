import { logScrapeStartKCNA, logScrapeStopKCNA } from "../util/log.js";
import { runScrapeStage, finalizeFailedScrape } from "../kcna/scrape-kcna.js";
import { scrapeKctvListing } from "./kctv-listing.js";
import { uploadVidPagesWatch, downloadVidsWatch } from "./vids.js";
import kcnaState from "../util/state.js";

export const scrapeWatch = async (inputParams) => {
  if (kcnaState.scrapeRunning) return kcnaState;

  kcnaState.scrapeRunning = true;
  let finalState;

  try {
    finalState = await runScrapeInvocationWatch(inputParams);
  } finally {
    kcnaState.scrapeRunning = false;
  }

  finalState.scrapeRunning = false;
  return finalState;
};

const runScrapeInvocationWatch = async (inputParams) => {
  try {
    await logScrapeStartKCNA();
    await runScrapePipelineWatch(inputParams);
  } catch (error) {
    return await finalizeFailedScrape(error);
  }

  return await logScrapeStopKCNA();
};

const runScrapePipelineWatch = async (inputParams) => {
  const entryArray = await runScrapeStage("KCTV LISTING WATCH", scrapeKctvListing, inputParams);
  await runScrapeStage("KCTV UPLOAD WATCH", uploadVidPagesWatch, entryArray);
  await runScrapeStage("KCTV DOWNLOAD WATCH", downloadVidsWatch);
};
