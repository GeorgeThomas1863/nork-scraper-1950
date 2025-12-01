import { logScrapeStartKCNA, logScrapeStopKCNA } from "../util/log.js";
import { calcHowMuchKCNA } from "../util/util.js";
import { scrapeArticleURLsKCNA, scrapeArticleContentKCNA } from "./articles.js";
import { scrapePicSetURLsKCNA, scrapePicSetContentKCNA } from "./picSets.js";

export const scrapeKCNA = async (inputParams) => {
  const { howMuch } = inputParams;

  //start it first
  await logScrapeStartKCNA();

  const articleInput = await calcHowMuchKCNA(howMuch, "articles");
  const picSetInput = await calcHowMuchKCNA(howMuch, "picSets");
  console.log("ARTICLE INPUT");
  console.log(articleInput);
  console.log("PIC SET INPUT");
  console.log(picSetInput);
  if (!articleInput || !picSetInput) return null;

  //URLs
  await scrapeArticleURLsKCNA(articleInput);
  await scrapePicSetURLsKCNA(picSetInput);

  await scrapeArticleContentKCNA();
  await scrapePicSetContentKCNA();

  //log stop
  await logScrapeStopKCNA();
};
