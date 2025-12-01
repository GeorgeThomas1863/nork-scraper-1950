import { logScrapeStartKCNA, logScrapeStopKCNA } from "../util/log.js";
import { calcHowMuchKCNA } from "../util/util.js";
import { scrapeArticleURLsKCNA, scrapeArticleContentKCNA, uploadArticlesKCNA } from "./articles.js";
import { scrapePicSetURLsKCNA, scrapePicSetContentKCNA, uploadPicSetsKCNA } from "./picSets.js";
import { downloadPicsKCNA, updatePicDataKCNA } from "./pics.js";

export const scrapeKCNA = async (inputParams) => {
  const { howMuch } = inputParams;

  //start it first
  await logScrapeStartKCNA();

  //calc input data
  const articleInput = await calcHowMuchKCNA(howMuch, "articles");
  const picSetInput = await calcHowMuchKCNA(howMuch, "picSets");
  if (!articleInput || !picSetInput) return null;

  //URLs
  await scrapeArticleURLsKCNA(articleInput);
  await scrapePicSetURLsKCNA(picSetInput);

  //CONTENT
  await scrapeArticleContentKCNA();
  await scrapePicSetContentKCNA();

  //MEDIA
  await downloadPicsKCNA();
  await updatePicDataKCNA();

  //TG
  await uploadArticlesKCNA();
  await uploadPicSetsKCNA();

  //log stop
  await logScrapeStopKCNA();
};
