import { articleURLs, picSetURLs } from "../../config/urls.js";

import { logScrapeStartKCNA, logScrapeStopKCNA } from "../util/log.js";
import { scrapeArticleURLsKCNA, scrapeArticleContentKCNA } from "./articles.js";
import { scrapePicSetURLsKCNA, scrapePicSetContentKCNA } from "./picSets.js";

export const scrapeKCNA = async (inputParams) => {
  const { howMuch } = inputParams;

  const articleInput = await calcHowMuchKCNA(howMuch, "articles");
  const picSetInput = await calcHowMuchKCNA(howMuch, "picSets");
  console.log("ARTICLE INPUT");
  console.log(articleInput);
  console.log("PIC SET INPUT");
  console.log(picSetInput);
  if (!articleInput || !picSetInput) return null;

  await logScrapeStartKCNA();

  //URLs
  await scrapeArticleURLsKCNA(articleInput);
  await scrapePicSetURLsKCNA(picSetInput);

  await scrapeArticleContentKCNA();
  await scrapePicSetContentKCNA();

  //log stop
  await logScrapeStopKCNA();
};

export const calcHowMuchKCNA = async (howMuch, type) => {
  if (!howMuch || !type) return null;

  let defaultURLs = articleURLs;
  if (type === "picSets") defaultURLs = picSetURLs;

  const dataArray = [];
  for (const typeKey in defaultURLs) {
    const typeArr = defaultURLs[typeKey];
    if (!typeArr || !typeArr.length) continue;
    let itemLength = typeArr.length;
    if (howMuch === "admin-scrape-new" && itemLength > 3) itemLength = 3;

    const returnObj = {
      type: typeKey,
      pageArray: [],
    };

    for (let i = 0; i < itemLength; i++) {
      const pageURL = typeArr[i];
      returnObj.pageArray.push(pageURL);
    }

    dataArray.push(returnObj);
  }

  return dataArray;
};
