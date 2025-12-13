import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";

import kcnaState from "../util/state.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { tgSendMessage } from "../tg-api.js";
import { postPicArrayTG } from "./pics.js";
import { updateLogKCNA } from "../util/log.js";
import { buildNumericId, extractItemDate, sortArrayByDate, normalizeInputsTG } from "../util/util.js";

export const scrapeArticleURLsKCNA = async (inputObj) => {
  if (!kcnaState.scrapeActive) return null;
  // console.log("SCRAPING KCNA ARTICLES; GETTING URLS");

  const articleTypeData = [];
  let articleCount = 0;
  for (const typeObj of inputObj) {
    const { typeArr, pageArray } = typeObj;
    const type = typeArr.slice(0, -3);

    console.log("TYPE: " + type + " | PAGE ARRAY LENGTH: " + pageArray.length);

    for (const pageURL of pageArray) {
      if (!kcnaState.scrapeActive) return articleTypeData;

      const articleListArray = await parseArticleListPage(pageURL, type);
      console.log("ARTICLE LIST ARRAY FOR PAGE: " + pageURL);
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

  if (checkData) {
    console.log(`URL ALREADY STORED: ${articleURL} `);
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

  // console.log("ARTICLE LIST PARAMS");
  // console.log(params);

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

    // console.log("ARTICLE PIC STORE PARAMS");
    // console.log(picParams);
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

export const uploadArticlesKCNA = async () => {
  const { articles, tgChannelId } = CONFIG;
  if (!kcnaState.scrapeActive) return null;

  console.log("UPLOADING ARTICLES KCNA");

  const articleModel = new dbModel({ keyExists: "url", keyEmpty: "uploaded" }, articles);
  const articleArray = await articleModel.findEmptyItems();
  if (!articleArray || !articleArray.length) return null;

  console.log("ARTICLE ARRAY TO UPLOAD: " + articleArray.length);

  const sortArray = await sortArrayByDate(articleArray);

  const articlePostArray = [];
  for (const articleObj of sortArray) {
    console.log("UPLOADING ARTICLE: " + articleObj.url);
    const { url } = articleObj;
    if (!kcnaState.scrapeActive) return articlePostArray;

    //add TG id
    articleObj.tgChannelId = tgChannelId;

    const postData = await postArticleTG(articleObj);
    if (!postData) continue;

    postData.uploaded = true;
    articlePostArray.push(postData);

    //store data
    try {
      const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: postData }, articles);
      const storeData = await storeModel.updateObjItem();
      console.log("ARTICLE UPLOAD STORE DATA");
      console.log(storeData);
    } catch (e) {
      console.log("MONGO ERROR FOR ARTICLE UPLOAD: " + url);
      console.log(e.message);
    }
  }

  kcnaState.scrapeStep = "PIC SET UPLOAD KCNA";
  kcnaState.scrapeMessage = `FINISHED UPLOADING ${articlePostArray.length} NEW ARTICLES TO TG`;
  await updateLogKCNA();

  return articlePostArray;
};

export const postArticleTG = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date, picArray } = inputObj;

  const tgInputs = await normalizeInputsTG(url, date);
  const uploadObj = { ...inputObj, ...tgInputs };

  await postArticleTitleTG(uploadObj);

  //post pics if exist
  if (picArray && picArray.length) await postArticlePicsTG(uploadObj);

  await postArticleContentTG(uploadObj);

  return uploadObj;
};

export const postArticleTitleTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId } = inputObj;

  try {
    const titleText = await buildArticleTitleText(inputObj);

    const params = {
      chat_id: tgChannelId,
      text: titleText,
      parse_mode: "HTML",
    };

    const data = await tgSendMessage(params);
    return data;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const postArticlePicsTG = async (inputObj) => {
  if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return null;
  const { picArray } = inputObj;

  //add caption to each pic
  const picArrayWithCaption = [];
  for (let i = 0; i < picArray.length; i++) {
    if (!kcnaState.scrapeActive) return picArrayWithCaption;

    const picObj = picArray[i];
    picObj.picIndex = i + 1;
    picObj.picCount = picArray.length;
    const articlePicCaption = await buildArticlePicCaption(picObj);
    if (!articlePicCaption) continue;

    picObj.caption = articlePicCaption;
    picArrayWithCaption.push(picObj);
  }

  const data = await postPicArrayTG(picArrayWithCaption);
  return data;
};

export const postArticleContentTG = async (inputObj) => {
  if (!inputObj || !inputObj.text) return null;
  const { text, title, dateNormal, urlNormal, tgChannelId } = inputObj;
  const { tgMaxLength } = CONFIG;

  const maxLength = tgMaxLength - title.length - dateNormal.length - urlNormal.length - 100;
  const chunkTotal = Math.ceil(text.length / maxLength);

  const chunkObj = { ...inputObj, chunkTotal };
  const chunkArray = [];
  for (let i = 0; i < chunkTotal; i++) {
    if (!kcnaState.scrapeActive) return chunkArray;

    const chunk = text.substring(i * maxLength, (i + 1) * maxLength);
    const chunkText = await buildChunkText(chunk, chunkObj, i);
    if (!chunkText) continue;

    const params = {
      chat_id: tgChannelId,
      text: chunkText,
      parse_mode: "HTML",
    };

    const data = await tgSendMessage(params);
    if (!data) continue;
    chunkObj.chunkData = data;

    chunkArray.push(chunkObj);
  }

  return chunkArray;
};

//--------------------------------

export const buildArticleTitleText = async (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, articleType, articleId, urlNormal } = inputObj;

  const titleText = `🇰🇵 🇰🇵 🇰🇵
  
-----------------
    
<b>${title}</b>
  
-----------------
  
<b>KCNA ARTICLE:</b> ${articleType} | <b>ID:</b> ${articleId} | <b>DATE:</b> <i>${dateNormal}</i> | <b>URL:</b> 
<i>${urlNormal}</i>
  `;

  return titleText;
};

export const buildArticlePicCaption = async (inputObj) => {
  if (!inputObj) return null;
  const { picIndex, picCount, date, url } = inputObj;

  //run again bc nested
  const normalInputs = await normalizeInputsTG(url, date);
  const { dateNormal, urlNormal } = normalInputs;

  const articlePicCaption = `
<b>ARTICLE PIC: ${picIndex} OF ${picCount}</b> | <b>DATE:</b> <i>${dateNormal}</i> | <b>PIC URL:</b>
<i>${urlNormal}</i>
`;

  return articlePicCaption;
};

export const buildChunkText = async (chunk, inputObj, chunkIndex) => {
  if (!inputObj) return null;
  const { urlNormal, chunkTotal } = inputObj;

  switch (chunkIndex) {
    case 0:
      return "<b>[ARTICLE TEXT]:</b>" + "\n\n" + chunk;

    case chunkTotal - 1:
      return chunk + "\n\n" + "<b>URL:</b> <i>" + urlNormal + "</i>";

    default:
      return chunk;
  }
};
