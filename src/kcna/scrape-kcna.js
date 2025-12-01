import { logScrapeStartKCNA, logScrapeStopKCNA } from "../util/log.js";
import { scrapeArticleURLsKCNA, scrapeArticleContentKCNA } from "./articles.js";
import { scrapePicSetURLsKCNA, scrapePicSetContentKCNA } from "./picSets.js";

export const scrapeKCNA = async () => {
  await logScrapeStartKCNA();

  //URLs
  await scrapeArticleURLsKCNA();
  await scrapePicSetURLsKCNA();

  await scrapeArticleContentKCNA();
  await scrapePicSetContentKCNA();

  //log stop
  await logScrapeStopKCNA();
};
