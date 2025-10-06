import { logScrapeStartKCNA, logScrapeStopKCNA } from "./state.js";
import { scrapeArticlesKCNA, uploadArticlesKCNA } from "./articles.js";
import { downloadPicsKCNA } from "./pics.js";
import { downloadVidsKCNA } from "./vids.js";
import { scrapePicSetsKCNA, uploadPicSetsKCNA } from "./picSets.js";
import { scrapeVidPagesKCNA, uploadVidPagesKCNA } from "./vidPages.js";
import { updatePicDataKCNA, updateVidDataKCNA } from "./update-db.js";

export const scrapeKCNA = async () => {
  await logScrapeStartKCNA();

  //URLs
  await scrapeArticlesKCNA();
  await scrapePicSetsKCNA();
  await scrapeVidPagesKCNA();

  //download media to server and updates db
  await downloadPicsKCNA();
  await downloadVidsKCNA();

  //update db
  await updatePicDataKCNA();
  await updateVidDataKCNA();

  //upload to TG
  await uploadArticlesKCNA();
  await uploadPicSetsKCNA();
  await uploadVidPagesKCNA();

  await logScrapeStopKCNA();
};
