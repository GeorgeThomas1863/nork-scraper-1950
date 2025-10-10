import { JSDOM } from "jsdom";

import CONFIG from "../../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../util/state.js";

import { extractItemDate, getIdFromURL } from "../util/util.js";
import { updateDisplayerKCNA } from "../util/api.js";

//ARTICLE URL SECTION
export const scrapeArticleURLsKCNA = async () => {
  const { articleTypeArr } = CONFIG;

  let articleCount = 0;
  const articleURLData = [];
  for (const type of articleTypeArr) {
    if (!kcnaState.scrapeActive) return articleURLData;

    try {
      const articleListTypeData = await parseArticleListByType(type);
      if (!articleListTypeData) continue;
      articleCount += articleListTypeData.length;

      articleURLData.push(articleListTypeData);
    } catch (e) {
      console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    }
  }

  console.log("ARTICLE COUNT");
  console.log(articleCount);

  kcnaState.scrapeStep = "ARTICLES URLS KCNA";
  kcnaState.scrapeMessage = `FINISHED SCRAPING ${articleCount} NEW ARTICLE URLS`;
  await updateDisplayerKCNA(kcnaState);

  return articleURLData;
};

export const parseArticleListByType = async (type) => {
  if (!type) return null;

  const typeURL = CONFIG[type];
  const htmlModel = new NORK({ url: typeURL });
  const html = await htmlModel.getHTML();

  if (!html) {
    const error = new Error("FAILED TO GET ARTICLE LIST HTML ");
    error.url = typeURL;
    error.function = "getArticleListHTML";
    throw error;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const articleLinkElement = document.querySelector(".article-link");
  const linkElementArray = articleLinkElement?.querySelectorAll("a");
  if (!linkElementArray || !linkElementArray.length) return null;

  const articleListArray = await extractArticleListArray(linkElementArray, type);
  return articleListArray;
};

export const extractArticleListArray = async (inputArray, type) => {
  if (!inputArray || !inputArray.length) return null;
  const { articles } = CONFIG;

  const articleListArray = [];
  for (const linkElement of inputArray) {
    if (!kcnaState.scrapeActive) return articleListArray;

    const articleLink = linkElement.getAttribute("href");
    const articleDate = await extractItemDate(linkElement);
    const articleURL = "http://www.kcna.kp" + articleLink;
    const articleId = await getIdFromURL(articleURL);

    const params = {
      url: articleURL,
      date: articleDate,
      articleType: type,
      scrapeId: kcnaState.scrapeId,
      articleId: articleId,
    };

    console.log("ARTICLE LIST PARAMS");
    console.log(params);

    const storeModel = new dbModel(params, articles);
    const storeData = await storeModel.storeUniqueURL();

    console.log("STORE DATA");
    console.log(storeData);

    articleListArray.push(params);
  }

  return articleListArray;
};
