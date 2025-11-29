import { logScrapeStartKCNA } from "../util/log.js";
import { scrapeArticleURLsKCNA } from "./articles.js";

export const scrapeKCNA = async () => {
  await logScrapeStartKCNA();

  //URLs
  await scrapeArticleURLsKCNA();
  // await scrapePicSetURLsKCNA();
};
