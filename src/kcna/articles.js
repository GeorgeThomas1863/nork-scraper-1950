import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
// import { articleURLs } from "../../config/urls.js";
import kcnaState from "../util/state.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { updateLogKCNA } from "../util/log.js";
import { buildNumericId, extractItemDate } from "../util/util.js";

export const scrapeArticleURLsKCNA = async (inputObj) => {
  if (!kcnaState.scrapeActive) return null;
  console.log("SCRAPING KCNA ARTICLES; GETTING URLS");

  const articleTypeData = [];
  let articleCount = 0;
  for (const typeObj of inputObj) {
    const { typeArr, pageArray } = typeObj;
    const type = typeArr.slice(0, -3);

    console.log("TYPE: " + type + " | PAGE ARRAY LENGTH: " + pageArray.length);

    for (const pageURL of pageArray) {
      if (!kcnaState.scrapeActive) return articleTypeData;

      const articleListArray = await parseArticleListPage(pageURL, type);
      // console.log("ARTICLE LIST ARRAY FOR PAGE: " + pageURL);
      // console.log(articleListArray);

      if (!articleListArray) continue;
      articleCount += articleListArray.length;

      articleTypeData.push(...articleListArray);
    }
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
  const articleURL = kcnaBaseURL + articleLink;

  const checkModel = new dbModel({ url: articleURL }, articles);
  const checkData = await checkModel.urlExistsCheck();
  console.log("CHECK DATA");
  console.log(checkData);

  if (checkData) {
    console.log(`URL ${articleURL} ALREADY STORED`);
    return null;
  }

  const articleDate = await extractItemDate(linkElement);
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

  try {
    //auto checks if new
    const storeModel = new dbModel(params, articles);
    const storeData = await storeModel.storeUniqueURL();

    console.log("ARTICLE STORE DATA");
    console.log(storeData);
  } catch (e) {
    console.log("MONGO ERROR FOR ARTICLE: " + articleURL);
    console.log(e.message);
  }

  return params;
};

//++++++++++++++++++++++++++++++++++

export const scrapeArticleContentKCNA = async () => {
  const { articles } = CONFIG;
  if (!kcnaState.scrapeActive) return null;

  //find new article urls by those without text content
  const newArticleModel = new dbModel({ keyExists: "url", keyEmpty: "text" }, articles);
  const newArticleArray = await newArticleModel.findEmptyItems();
  if (!newArticleArray || !newArticleArray.length) return null;

  console.log("NEW ARTICLE ARRAY");
  console.log(newArticleArray.length);

  let articleCount = 0;
  const articleContentArray = [];
  for (const articleObj of newArticleArray) {
    if (!kcnaState.scrapeActive) return articleContentArray;

    const articleContentData = await parseArticleContent(articleObj);
    if (!articleContentData) continue;
    articleCount++;

    articleContentArray.push(articleContentData);
  }

  return articleContentArray;
};

export const parseArticleContent = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date } = inputObj;
  const { articles } = CONFIG;

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();
  if (!html) {
    console.log(`FAILED TO GET HTML FOR URL: ${url}`);
    return null;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const articleTitle = await extractArticleTitle(document);
  const articleText = await extractArticleText(document);
  const articlePicPage = await extractArticlePicPage(document);
  const articlePicArray = await extractArticlePicArray(articlePicPage, date);

  const params = {
    title: articleTitle,
    text: articleText,
  };

  if (articlePicArray) {
    params.picPageURL = articlePicPage;
    params.picArray = articlePicArray;
  }

  console.log("ARTICLE CONTENT PARAMS");
  console.log(params);

  try {
    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: params }, articles);
    const storeData = await storeModel.updateObjItem();
    console.log("STORE ARTICLE CONTENT DATA");
    console.log(storeData);
  } catch (e) {
    console.log("MONGO ERROR FOR ARTICLE: " + url);
    console.log(e.message);
  }

  return params;
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
  if (!url) return null;

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();

  if (!html) {
    console.log(`FAILED TO GET HTML FOR URL: ${url}`);
    return null;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  //get and loop through img elements
  const picArray = [];
  const imgArray = document.querySelectorAll("img");
  for (let i = 0; i < imgArray.length; i++) {
    if (!kcnaState.scrapeActive) return picArray;

    const imgSrc = imgArray[i].getAttribute("src");
    if (!imgSrc) continue;

    const articlePicURL = kcnaBaseURL + imgSrc;

    picArray.push(articlePicURL);

    //store url to picDB (so dont have to do again); build params
    const picId = await buildNumericId("pics");
    const picParams = {
      picId: picId,
      url: articlePicURL,
      scrapeId: kcnaState.scrapeId,
      date: date,
    };

    console.log("ARTICLE PIC STORE PARAMS");
    console.log(picParams);
    try {
      const storePicModel = new dbModel(picParams, pics);
      await storePicModel.storeUniqueURL();
    } catch (e) {
      console.log("MONGO ERROR FOR ARTICLE PIC: " + articlePicURL);
      console.log(e.message);
    }
  }

  return picArray;
};

//+++++++++++++++++++++++++++++++++++

export const uploadArticlesKCNA = async () => {};
