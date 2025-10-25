import { JSDOM } from "jsdom";

import CONFIG from "../../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../util/state.js";

import { buildNumericId } from "../util/util.js";
import { updateLogKCNA } from "../util/log.js";

export const scrapeArticleContentKCNA = async () => {
  const { articles } = CONFIG;
  if (!kcnaState.scrapeActive) return null;

  //find new article urls by those without text content
  const newArticleModel = new dbModel({ keyExists: "url", keyEmpty: "text" }, articles);
  const newArticleArray = await newArticleModel.findEmptyItems();
  if (!newArticleArray || !newArticleArray.length) return null;

  const articleContentData = await parseNewArticleArray(newArticleArray);
  return articleContentData;
};

export const parseNewArticleArray = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  let articleCount = 0;
  const newArticleArray = [];
  for (const article of inputArray) {
    if (!kcnaState.scrapeActive) return newArticleArray;

    const { url, date } = article;
    try {
      const articleContent = await parseArticleContent(url, date);
      if (!articleContent) continue;
      articleCount++;

      newArticleArray.push(articleContent);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  kcnaState.scrapeStep = "PIC SET URLS KCNA";
  kcnaState.scrapeMessage = `FINISHED SCRAPING CONTENT FOR ${articleCount} NEW ARTICLES`;
  await updateLogKCNA();

  return newArticleArray;
};

export const parseArticleContent = async (url, date) => {
  if (!url) return null;
  const { articles } = CONFIG;
  try {
    const kcna = new NORK({ url });
    const html = await kcna.getHTML();
    if (!html) {
      const error = new Error("FAILED TO GET ARTICLE CONTENT HTML ");
      error.url = url;
      error.function = "getArticleContentHTML";
      throw error;
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const articleTitle = await extractArticleTitle(document);
    const articleText = await extractArticleText(document);
    const articlePicPage = await extractArticlePicPage(document);
    const articlePicArray = await extractArticlePicArray(articlePicPage, date);

    const storeParams = {
      title: articleTitle,
      text: articleText,
    };

    if (articlePicArray) {
      storeParams.picPageURL = articlePicPage;
      storeParams.picArray = articlePicArray;
    }

    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: storeParams }, articles);
    const storeData = await storeModel.updateObjItem();
    console.log("STORE DATA");
    console.log(storeData);

    return storeParams;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const extractArticleTitle = async (document) => {
  const titleElement = document.querySelector(".article-main-title");
  const articleTitle = titleElement?.textContent?.replace(/\s+/g, " ").trim();
  return articleTitle;
};

export const extractArticleText = async (document) => {
  //extract text content
  const textElement = document.querySelector(".content-wrapper");
  const textArray = textElement.querySelectorAll("p"); //array of paragraph elements

  const paragraphArray = [];
  for (let i = 0; i < textArray.length; i++) {
    paragraphArray.push(textArray[i].textContent.trim());
  }

  // Join paragraphs with double newlines for better readability
  const articleText = paragraphArray.join("\n\n");
  return articleText;
};

export const extractArticlePicPage = async (document) => {
  //get article PAGE (if exists) where all pics are displayed
  const mediaIconElement = document.querySelector(".media-icon");
  const picPageHref = mediaIconElement?.firstElementChild?.getAttribute("href");

  //return null if  pic doesnt exist
  if (!picPageHref) return null;

  //otherwise build pic / pic array
  const picPageURL = "http://www.kcna.kp" + picPageHref;
  return picPageURL;
};

export const extractArticlePicArray = async (url, date) => {
  const { pics, kcnaBaseURL } = CONFIG;
  const { scrapeId } = kcnaState;
  if (!url) return null;

  try {
    const kcna = new NORK({ url });
    const html = await kcna.getHTML();

    if (!html) {
      const error = new Error("FAILED TO GET ARTICLE PIC ARRAY HTML ");
      error.url = url;
      error.function = "extractArticlePicArray";
      throw error;
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    //get and loop through img elements
    const picArray = [];
    const imgArray = document.querySelectorAll("img");
    for (let i = 0; i < imgArray.length; i++) {
      if (!kcnaState.scrapeActive) return picArray;

      try {
        const imgSrc = imgArray[i].getAttribute("src");
        if (!imgSrc) continue;

        const articlePicURL = kcnaBaseURL + imgSrc;

        picArray.push(articlePicURL);

        //store url to picDB (so dont have to do again); build params
        const picId = await buildNumericId("pics");
        const storeParams = {
          picId: picId,
          url: articlePicURL,
          scrapeId: scrapeId,
          date: date,
        };

        console.log("ARTICLE PIC STORE PARAMS");
        console.log(storeParams);

        const storePicModel = new dbModel(storeParams, pics);
        await storePicModel.storeUniqueURL();
      } catch (e) {
        console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
      }
    }

    return picArray;
  } catch (e) {
    console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    return null;
  }
};
