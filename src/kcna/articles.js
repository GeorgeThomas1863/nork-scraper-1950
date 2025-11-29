import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import kcnaState from "../util/state.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { updateLogKCNA } from "../util/log.js";
import { buildNumericId, extractItemDate } from "../util/util.js";

//HERE
export const scrapeArticleURLsKCNA = async () => {
  // const { articleTypeArr } = CONFIG;

  console.log("RUN NEW SCRAPE KCNA");

  // let articleCount = 0;
  // const articleURLData = [];
  // for (const type of articleTypeArr) {
  //   if (!kcnaState.scrapeActive) return articleURLData;

  //   try {
  //     const articleListTypeData = await parseArticleListKCNA(type);
  //     if (!articleListTypeData) continue;
  //     articleCount += articleListTypeData.length;

  //     articleURLData.push(...articleListTypeData);
  //   } catch (e) {
  //     console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
  //   }
  // }

  // console.log("ARTICLE COUNT");
  // console.log(articleCount);

  // kcnaState.scrapeStep = "ARTICLE CONTENT KCNA";
  // kcnaState.scrapeMessage = `FINISHED SCRAPING ${articleCount} NEW ARTICLE URLS`;
  // await updateLogKCNA();

  // return articleURLData;
};

// export const parseArticleListKCNA = async (type) => {
//   if (!type) return null;

//   try {
//     const typeURL = CONFIG[type];
//     const htmlModel = new NORK({ url: typeURL });
//     const html = await htmlModel.getHTML();

//     if (!html) {
//       const error = new Error("FAILED TO GET ARTICLE LIST HTML ");
//       error.url = typeURL;
//       error.function = "getArticleListHTML";
//       throw error;
//     }

//     const dom = new JSDOM(html);
//     const document = dom.window.document;

//     const articleLinkElement = document.querySelector(".article-link");
//     const linkElementArray = articleLinkElement?.querySelectorAll("a");
//     if (!linkElementArray || !linkElementArray.length) return null;

//     const articleListArray = await extractArticleListArray(linkElementArray, type);
//     return articleListArray;
//   } catch (e) {
//     console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
//     return null;
//   }
// };

// export const extractArticleListArray = async (inputArray, type) => {
//   if (!inputArray || !inputArray.length) return null;
//   const { articles, kcnaBaseURL } = CONFIG;

//   const articleListArray = [];
//   for (const linkElement of inputArray) {
//     if (!kcnaState.scrapeActive) return articleListArray;

//     const articleLink = linkElement.getAttribute("href");
//     const articleDate = await extractItemDate(linkElement);
//     const articleURL = kcnaBaseURL + articleLink;

//     //check if article already exists in db
//     const checkModel = new dbModel({ keyToLookup: "url", itemValue: articleURL }, articles);
//     const checkData = await checkModel.itemExistsCheckBoolean();
//     if (checkData) continue;

//     //create new id if article not in db
//     const articleId = await buildNumericId("articles");

//     const params = {
//       url: articleURL,
//       date: articleDate,
//       articleType: type,
//       scrapeId: kcnaState.scrapeId,
//       articleId: articleId,
//     };

//     // console.log("ARTICLE LIST PARAMS");
//     // console.log(params);

//     const storeModel = new dbModel(params, articles);
//     const storeData = await storeModel.storeUniqueURL();

//     console.log("ARTICLE LIST STORE DATA");
//     console.log(storeData);

//     articleListArray.push(params);
//   }

//   return articleListArray;
// };
