import { logScrapeStartKCNA, logScrapeStopKCNA } from "./state.js";
import { scrapeArticlesKCNA, uploadArticlesKCNA } from "./articles.js";
import { scrapePicSetsKCNA } from "./picSets.js";
import { scrapeVidPagesKCNA } from "./vidPages.js";
import { downloadPicsKCNA, uploadPicsKCNA } from "./pics.js";
import { downloadVidsKCNA, uploadVidsKCNA } from "./vids.js";
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

  //upload to TG
  await uploadArticlesKCNA();
  await uploadPicsKCNA();
  await uploadVidsKCNA();

  //update collections
  // await updatePicDataKCNA();
  // await updateVidDataKCNA();

  await logScrapeStopKCNA();
};
