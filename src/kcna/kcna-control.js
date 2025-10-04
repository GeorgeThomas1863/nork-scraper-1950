import { logScrapeStartKCNA, logScrapeStopKCNA } from "./state.js";
import { scrapeArticlesKCNA } from "./articles.js";
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

  //download to server
  await downloadPicsKCNA();
  await downloadVidsKCNA();

  //upload to TG
  await uploadPicsKCNA();
  await uploadVidsKCNA();

  //update collections
  await updatePicDataKCNA();
  await updateVidDataKCNA();

  await logScrapeStopKCNA();
};
