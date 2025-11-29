import { logScrapeStartKCNA } from "./util/log.js";

export const scrapeKCNA = async () => {
  await logScrapeStartKCNA();

  //URLs
  await scrapeArticleURLsKCNA();
  // await scrapePicSetURLsKCNA();
};
