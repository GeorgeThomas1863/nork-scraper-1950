import { logScrapeStartKCNA, logScrapeStopKCNA } from "./util/log.js";

import { scrapeArticleURLsKCNA } from "./articles/articles-urls.js";
import { scrapeArticleContentKCNA } from "./articles/articles-content.js";
import { uploadArticlesKCNA } from "./articles/articles-upload.js";

import { scrapePicSetURLsKCNA } from "./picSets/picSets-urls.js";
import { scrapePicSetContentKCNA } from "./picSets/picSets-content.js";
import { uploadPicSetsKCNA } from "./picSets/picSets-upload.js";

import { scrapeVidPageURLsKCNA } from "./vidPages/vidPages-urls.js";
import { scrapeVidPageContentKCNA } from "./vidPages/vidPages-content.js";
import { uploadVidPagesKCNA } from "./vidPages/vidPages-upload.js";

import { downloadPicsKCNA } from "./pics/pics-download.js";
import { downloadVidsKCNA } from "./vids/vids-download.js";

import { updatePicDataKCNA, updateVidDataKCNA } from "./util/update-db.js";

export const scrapeKCNA = async () => {
  //await logScrapeStartKCNA(displayerId);
  await logScrapeStartKCNA();

  //URLs
  await scrapeArticleURLsKCNA();
  await scrapePicSetURLsKCNA();
  await scrapeVidPageURLsKCNA();

  //download content
  await scrapeArticleContentKCNA();
  await scrapePicSetContentKCNA();
  await scrapeVidPageContentKCNA();

  //download media
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
