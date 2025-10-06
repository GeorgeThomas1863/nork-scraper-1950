import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { tgSendMessage } from "../tg-api.js";
import kcnaState from "./state.js";
import { postPicArrayTG } from "./pics.js";
import { extractItemDate, getIdFromURL, normalizeTGInputs } from "./util.js";

export const scrapeArticlesKCNA = async () => {
  const { articles } = CONFIG;

  const articleURLs = await scrapeArticleURLs();
  console.log("NEW ARTICLE URLS");
  console.log(articleURLs);

  //find new article urls by those without text content
  const newArticleModel = new dbModel({ keyExists: "url", keyEmpty: "text" }, articles);
  const newArticleArray = await newArticleModel.findEmptyItems();

  const articleContentArray = await scrapeArticleContent(newArticleArray);
  console.log("ARTICLE CONTENT ARRAY");
  console.log(articleContentArray);

  return articleContentArray;
};

//ARTICLE URL SECTION
export const scrapeArticleURLs = async () => {
  const { articleTypeArr, articles } = CONFIG;

  const articleURLArray = [];
  for (const type of articleTypeArr) {
    try {
      const typeURL = CONFIG[type];

      const kcna = new NORK({ url: typeURL });
      const html = await kcna.getHTML();
      const articleListArray = await parseArticleList(html, type);

      //loop through each article and store
      for (const a of articleListArray) {
        const { articleLink, articleDate } = a;
        const articleURL = "http://www.kcna.kp" + articleLink;
        const articleId = await getIdFromURL(articleURL);
        const params = {
          url: articleURL,
          date: articleDate,
          articleType: type,
          scrapeId: kcnaState.scrapeId,
          articleId: articleId,
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

export const parseArticleList = async (html, type) => {
  if (!html) {
    const error = new Error("FAILED TO GET ARTICLE LIST HTML ");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "parseArticleList";
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
    error.function = "parseArticleList";
    throw error;
  }

  const articleArray = [];
  for (const linkElement of linkElementArray) {
    const articleLink = linkElement.getAttribute("href");
    const articleDate = await extractItemDate(linkElement);
    articleArray.push({ articleLink, articleDate });
  }

  //throw error if no links found
  if (!articleArray || !articleArray.length) {
    const error = new Error("CANT EXTRACT ARTICLES FROM ELEMENT");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "parseArticleList";
    throw error;
  }

  return articleArray;
};

//-----------------------------

//ARTICLE CONTENT SECTION

export const scrapeArticleContent = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const articleContentArray = [];
  for (const article of inputArray) {
    const { url, date } = article;
    try {
      const articleContent = await parseArticleContent(url, date);
      if (!articleContent) continue;

      console.log("ARTICLE CONTENT");
      console.log(articleContent);
      articleContentArray.push(articleContent);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }
  return articleContentArray;
};

export const parseArticleContent = async (url, date) => {
  if (!url) return null;
  const { articles } = CONFIG;

  console.log("CONTENT URL");
  console.log(url);

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();

  if (!html) {
    const error = new Error("FAILED TO GET ARTICLE ITEM HTML ");
    error.url = url;
    error.function = "parseArticleContent";
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
    picPageURL: articlePicPage,
  };

  if (articlePicArray) {
    storeParams.picArray = articlePicArray;
  }

  const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: storeParams }, articles);
  const storeData = await storeModel.updateObjItem();
  console.log("STORE DATA");
  console.log(storeData);

  return storeParams;
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
  const { pics } = CONFIG;
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
      try {
        const imgSrc = imgArray[i].getAttribute("src");
        if (!imgSrc) continue;

        const articlePicURL = "http://www.kcna.kp" + imgSrc;

        picArray.push(articlePicURL);

        //store url to picDB (so dont have to do again); build params
        const picId = await getIdFromURL(articlePicURL);
        const storeParams = {
          picId: picId,
          url: articlePicURL,
          scrapeId: scrapeId,
          date: date,
        };

        console.log("!!!!!!!!!!!!!");
        console.log("STORE PARAMS");
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

//-------------------------

//UPLOAD TG SECTION

export const uploadArticlesKCNA = async () => {
  const { articles, tgChannelId } = CONFIG;
  const articleModel = new dbModel({ keyExists: "url", keyEmpty: "tgChannelId" }, articles);
  const articleArray = await articleModel.findEmptyItems();
  if (!articleArray || !articleArray.length) return null;

  for (const article of articleArray) {
    const { url, date, picArray } = article;

    //normalize url and date
    const tgInputs = await normalizeTGInputs(url, date);
    const uploadObj = { ...article, ...tgInputs };
    const titleText = await buildArticleTitleText(uploadObj);
    uploadObj.titleText = titleText;

    //channel to upload to
    uploadObj.tgChannelId = tgChannelId;

    const uploadTitleData = await uploadArticleTitle(uploadObj);

    //post pics if exist
    if (picArray && picArray.length) {
      const articlePicArray = await addCaptionToArticlePics(uploadObj);
      const postPicData = await postPicArrayTG(articlePicArray);
      console.log("UPLOAD PIC DATA");
      console.log(postPicData);
    }
  }
};

export const buildArticleTitleText = async (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, articleType, articleId } = inputObj;

  const titleText = `🇰🇵 🇰🇵 🇰🇵

-----------------
  
<b>${title}</b>

-----------------

<b>ARTICLE TYPE:</b> ${articleType} | <b>ID:</b> ${articleId} | <b>DATE:</b> <i>${dateNormal}</i>
`;

  return titleText;
};

export const uploadArticleTitle = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId, titleText } = inputObj;

  const params = {
    chat_id: tgChannelId,
    text: titleText,
    parse_mode: "HTML",
  };

  console.log("ARTICLE TITLE PARAMS");
  console.log(params);

  const data = await tgSendMessage(params);
  return data;
};

export const addCaptionToArticlePics = async (inputObj) => {
  if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return null;
  const { picArray, dateNormal } = inputObj;

  const picArrayWithCaption = [];
  for (let i = 0; i < picArray.length; i++) {
    const picObj = picArray[i];
    const articlePicCaption = await buildArticlePicCaption(inputObj, i);
    if (!articlePicCaption) continue;

    picObj.caption = articlePicCaption;
    picArrayWithCaption.push(picObj);
  }
  return picArrayWithCaption;
};

export const buildArticlePicCaption = async (inputObj, picIndex) => {
  if (!inputObj) return null;
  const { picArray, dateNormal } = inputObj;

  const articlePicCaption = `
<b>ARTICLE PIC: ${picIndex + 1} OF ${picArray.length}</b> 
<i>${dateNormal}</i>
`;

  return articlePicCaption;
};
