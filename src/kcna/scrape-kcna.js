import { logScrapeStartKCNA, logScrapeStopKCNA } from "../util/log.js";
import { scrapeArticleURLsKCNA } from "./articles.js";
import { scrapePicSetURLsKCNA } from "./picSets.js";

export const scrapeKCNA = async () => {
  await logScrapeStartKCNA();

  //URLs
  await scrapeArticleURLsKCNA();
  await scrapePicSetURLsKCNA();

  //log stop
  await logScrapeStopKCNA();
};
