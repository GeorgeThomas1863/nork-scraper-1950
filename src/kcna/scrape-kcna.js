import { logScrapeStartKCNA, logScrapeStopKCNA } from "../util/log.js";
import { calcHowMuchKCNA } from "../util/util.js";
import { scrapeArticleURLsKCNA, scrapeArticleContentKCNA, uploadArticlesKCNA } from "./articles.js";
import { scrapePicSetURLsKCNA, scrapePicSetContentKCNA, uploadPicSetsKCNA } from "./picSets.js";
import { downloadPicsKCNA } from "./pics.js";
import { updatePicDataKCNA } from "../util/update-db.js";
import kcnaState from "../util/state.js";

export const scrapeKCNA = async (inputParams) => {
  kcnaState.scrapeRunning = true;
  let finalState;

  try {
    finalState = await runScrapeInvocation(inputParams);
  } finally {
    kcnaState.scrapeRunning = false;
  }

  finalState.scrapeRunning = false;
  return finalState;
};

const runScrapeInvocation = async (inputParams) => {
  const { howMuch } = inputParams;

  try {
    await logScrapeStartKCNA();
    await runScrapePipeline(howMuch);
  } catch (error) {
    return await finalizeFailedScrape(error);
  }

  return await logScrapeStopKCNA();
};

const runScrapePipeline = async (howMuch) => {
  const articleInput = await runScrapeStage("ARTICLE URLS KCNA", calcHowMuchKCNA, howMuch, "articles");
  const picSetInput = await runScrapeStage("PIC SET URLS KCNA", calcHowMuchKCNA, howMuch, "picSets");
  if (!articleInput || !picSetInput) return null;

  await runScrapeStage("ARTICLE URLS KCNA", scrapeArticleURLsKCNA, articleInput);
  await runScrapeStage("PIC SET URLS KCNA", scrapePicSetURLsKCNA, picSetInput);
  await runScrapeStage("ARTICLE CONTENT KCNA", scrapeArticleContentKCNA);
  await runScrapeStage("PIC SET CONTENT KCNA", scrapePicSetContentKCNA);
  await runScrapeStage("PIC DOWNLOAD KCNA", downloadPicsKCNA);
  await runScrapeStage("PIC DATA UPDATE KCNA", updatePicDataKCNA);
  await runScrapeStage("ARTICLE UPLOAD KCNA", uploadArticlesKCNA);
  await runScrapeStage("PIC SET UPLOAD KCNA", uploadPicSetsKCNA);
};

const runScrapeStage = async (scrapeStep, operation, ...operationArgs) => {
  kcnaState.scrapeStep = scrapeStep;
  return await operation(...operationArgs);
};

const finalizeFailedScrape = async (error) => {
  console.log("SCRAPE ERROR: " + error.message);
  error.apiMessage = `Scrape failed during ${kcnaState.scrapeStep || "scrape initialization"}`;
  kcnaState.scrapeActive = false;

  try {
    const finalState = await logScrapeStopKCNA(error);
    error.apiMessage = finalState.scrapeMessage || error.apiMessage;
  } catch (finalizationError) {
    console.log("SCRAPE FINALIZATION ERROR: " + finalizationError.message);
  }

  throw error;
};
