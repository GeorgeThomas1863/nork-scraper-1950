import { logScrapeStartKCNA, logScrapeStopKCNA } from "../util/log.js";
import { calcHowMuchKCNA } from "../util/util.js";
import { scrapeArticleURLsKCNA, scrapeArticleContentKCNA, uploadArticlesKCNA } from "./articles.js";
import { scrapePicSetURLsKCNA, scrapePicSetContentKCNA, uploadPicSetsKCNA } from "./picSets.js";
import { downloadPicsKCNA } from "./pics.js";
import { updatePicDataKCNA } from "../util/update-db.js";

export const scrapeKCNA = async (inputParams) => {
  const { howMuch } = inputParams;

  try {
    await logScrapeStartKCNA();

    const articleInput = await calcHowMuchKCNA(howMuch, "articles");
    const picSetInput = await calcHowMuchKCNA(howMuch, "picSets");

    if (articleInput && picSetInput) {
      await scrapeArticleURLsKCNA(articleInput);
      await scrapePicSetURLsKCNA(picSetInput);
      await scrapeArticleContentKCNA();
      await scrapePicSetContentKCNA();
      await downloadPicsKCNA();
      await updatePicDataKCNA();
      await uploadArticlesKCNA();
      await uploadPicSetsKCNA();
    }
  } catch (e) {
    console.log("SCRAPE ERROR: " + e.message);
  } finally {
    return await logScrapeStopKCNA();
  }
};
