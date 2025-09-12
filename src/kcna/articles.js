import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import KCNA from "../../models/kcna.js";
import dbModel from "../../models/db-model.js";
import { kcnaState } from "./kcna-state.js";

export const scrapeArticlesKCNA = async () => {
  const articleURLs = await scrapeArticleURLs();
  console.log("ARTICLE URLS");
  console.log(articleURLs);

  //find new article urls by those without text content
  const newArticleModel = new dbModel({ keyExists: "url", keyEmpty: "text" }, articles);
  const newArticleArray = await newArticleModel.findEmptyItems();
  console.log("NEW ARTICLE ARRAY");
  console.log(newArticleArray);
};

//GET ARTICLE URLS
export const scrapeArticleURLs = async () => {
  const { articleTypeArr, articles } = CONFIG;

  const articleURLArray = [];
  for (const type of articleTypeArr) {
    try {
      const typeURL = CONFIG[type];

      const kcna = new KCNA({ url: typeURL });
      const html = await kcna.getHTML();
      const articleListArray = await extractArticleList(html, type);

      //loop through each article and store
      for (const a of articleListArray) {
        const articleURL = "http://www.kcna.kp" + a;
        const params = {
          url: articleURL,
          articleType: type,
          scrapeId: kcnaState.scrapeId,
        };

        const storeModel = new dbModel(params, articles);
        const storeData = await storeModel.storeUniqueURL();
        console.log("STORE DATA");
        console.log(storeData);

        articleURLArray.push(params);
      }
    } catch (e) {
      console.log(e.message + "; URL: " + e.url + "; ARTICLE TYPE: " + e.articleType + "; F BREAK: " + e.function);
    }
  }

  return articleURLArray;
};

export const extractArticleList = async (html, type) => {
  if (!html) {
    const error = new Error("FAILED TO GET ARTICLE LIST HTML ");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "extractArticleList";
    throw error;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const articleLinkElement = document.querySelector(".article-link");
  const linkElementArray = articleLinkElement?.querySelectorAll("a");

  //throw error if no links found
  if (!linkElementArray || !linkElementArray.length) {
    const error = new Error("CANT EXTRACT ARTICLE LIST");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "extractArticleList";
    throw error;
  }

  const articleArray = [];
  for (const linkElement of linkElementArray) {
    const articleLink = linkElement.getAttribute("href");
    articleArray.push(articleLink);
  }

  //throw error if no links found
  if (!articleArray || !articleArray.length) {
    const error = new Error("CANT EXTRACT ARTICLES FROM ELEMENT");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "extractArticleList";
    throw error;
  }

  return articleArray;
};
