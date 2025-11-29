import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import articleURLs from "../../config/urls.js";
import kcnaState from "../util/state.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { updateLogKCNA } from "../util/log.js";
import { buildNumericId, extractItemDate } from "../util/util.js";

//HERE
export const scrapeArticleURLsKCNA = async () => {
  if (!kcnaState.scrapeActive) return null;
  console.log("SCRAPING KCNA ARTICLES; GETTING URLS");

  let articleCount = 0;
  const articleTypeData = [];
  for (const type in articleURLs) {
    const typeArr = articleURLs[type];
    for (const pageURL of typeArr) {
      if (!kcnaState.scrapeActive) return articleTypeData;

      const articleListArray = await parseArticleListPage(pageURL, type);

      if (!articleListArray) continue;
      articleCount += articleListArray.length;

      articleTypeData.push(...articleListArray);
    }

    console.log(`ARTICLE TYPE: ${type} | COUNT: ${articleCount}`);
  }

  kcnaState.scrapeStep = "ARTICLE CONTENT KCNA";
  kcnaState.scrapeMessage = `FINISHED SCRAPING ${articleCount} NEW ARTICLE URLS`;
  await updateLogKCNA();

  return articleTypeData;
};

export const parseArticleListPage = async (pageURL, type) => {
  if (!pageURL || !type) return null;

  const htmlModel = new NORK({ url: pageURL });
  const html = await htmlModel.getHTML();
  if (!html) {
    console.log(`FAILED TO GET HTML FOR URL: ${pageURL}`);
    return null;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const articleLinkElement = document.querySelector(".article-link");
  const linkElementArray = articleLinkElement?.querySelectorAll("a");
  if (!linkElementArray || !linkElementArray.length) {
    console.log("CANT FIND ARTICLE LINKS IN HTML");
    return null;
  }

  const articleListArray = [];
  for (const linkElement of linkElementArray) {
    if (!kcnaState.scrapeActive) return articleListArray;

    const articleLinkObj = await parseArticleLinkElement(linkElement, pageURL, type);
    if (!articleLinkObj) continue;
    articleListArray.push(articleLinkObj);
  }

  return articleListArray;
};

export const parseArticleLinkElement = async (linkElement, pageURL, type) => {
  if (!linkElement || !pageURL || !type) return null;
  const { kcnaBaseURL, articles } = CONFIG;

  const articleLink = linkElement.getAttribute("href");
  const articleDate = await extractItemDate(linkElement);
  const articleURL = kcnaBaseURL + articleLink;

  try {
    //check if article already exists in db
    const checkModel = new dbModel({ keyToLookup: "url", itemValue: articleURL }, articles);
    const checkData = await checkModel.itemExistsCheckBoolean();
    if (checkData) {
      console.log(`ARTICLE ALREADY STORED: ${articleURL}`);
      return null;
    }

    //create new id if article not in db
    const articleId = await buildNumericId("articles");

    const params = {
      url: articleURL,
      pageURL: pageURL,
      date: articleDate,
      articleType: type,
      scrapeId: kcnaState.scrapeId,
      articleId: articleId,
    };

    console.log("ARTICLE LIST PARAMS");
    console.log(params);

    const storeModel = new dbModel(params, articles);
    const storeData = await storeModel.storeUniqueURL();

    console.log("ARTICLE STORE DATA");
    console.log(storeData);

    return params;
  } catch (e) {
    console.log("MONGO ERROR FOR ARTICLE: " + articleURL);
    console.log(e.message);
    return null;
  }
};
