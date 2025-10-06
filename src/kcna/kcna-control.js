import { logScrapeStartKCNA, logScrapeStopKCNA } from "./state.js";
import { scrapeArticleURLsKCNA } from "./articles/articles-urls.js";
import { downloadArticlesKCNA } from "./articles/articles-download.js";
import { uploadArticlesKCNA } from "./articles/articles-upload.js";

import { scrapePicSetURLsKCNA } from "./pics/picSets-urls.js";
import { scrapeVidPageURLsKCNA } from "./vids/vidPages-urls.js";

import { downloadPicsKCNA } from "./pics/pics.js";
import { downloadVidsKCNA } from "./vids/vids.js";
import { scrapePicSetsKCNA, uploadPicSetsKCNA } from "./pics/picSets.js";
import { scrapeVidPagesKCNA, uploadVidPagesKCNA } from "./vids/vidPages.js";
import { updatePicDataKCNA, updateVidDataKCNA } from "./update-db.js";

export const scrapeKCNA = async () => {
  await logScrapeStartKCNA();

  //URLs
  await scrapeArticleURLsKCNA();
  await scrapePicSetURLsKCNA();
  await scrapeVidPageURLsKCNA();

  //download media to server and updates db
  await downloadArticlesKCNA();
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
