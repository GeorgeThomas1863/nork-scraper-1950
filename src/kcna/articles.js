import { JSDOM } from "jsdom";

import kcnaState from "../util/state.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { tgSendMessage } from "../tg-api.js";
import { postPicArrayTG } from "./pics.js";
import { updateLogKCNA } from "../util/log.js";
import { buildNumericId, extractItemDate, sortArrayByDate, normalizeInputsTG } from "../util/util.js";

export const scrapeArticleURLsKCNA = async (inputObj) => {
  if (!kcnaState.scrapeActive) return null;

  const articleTypeData = [];
  let articleCount = 0;
  let candidateCount = 0;
  for (const typeObj of inputObj) {
    const { typeKey, pageArray } = typeObj;
    const type = typeKey.slice(0, -3);

    console.log("TYPE: " + type + " | PAGE ARRAY LENGTH: " + pageArray.length);

    for (const pageURL of pageArray) {
      if (!kcnaState.scrapeActive) return articleTypeData;

      const articleListArray = await parseArticleListPage(pageURL, type);

      if (!articleListArray) continue;
      const pageCandidates = articleListArray.candidateCount ?? 0;
      console.log(`ARTICLE LIST PAGE: ${pageURL} | NEW: ${articleListArray.length} OF ${pageCandidates}`);
      candidateCount += pageCandidates;
      articleCount += articleListArray.length;

      articleTypeData.push(...articleListArray);
    }
  }

  if (!candidateCount) throw new Error("Article listing produced zero candidates");

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

  const linkElementArray = document.querySelectorAll(".article a[href*='/article/detail/']");
  if (!linkElementArray.length) {
    console.log("CANT FIND ARTICLE LINKS IN HTML");
    return [];
  }

  const articleListArray = [];
  articleListArray.candidateCount = linkElementArray.length;
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
  const articles = process.env.ARTICLES_COLLECTION;

  const articleLink = linkElement.getAttribute("href");
  const articleURL = buildAbsoluteURL(articleLink, pageURL);
  if (!articleURL) return null;

  const checkModel = new dbModel({ url: articleURL }, articles);
  const exists = await checkModel.urlExists();

  if (exists) return null;

  const articleDate = extractItemDate(linkElement.closest(".article") ?? linkElement);
  const articleId = await buildNumericId("articles");

  const params = {
    url: articleURL,
    pageURL: pageURL,
    date: articleDate,
    articleType: type,
    scrapeId: kcnaState.scrapeId,
    articleId: articleId,
  };

  try {
    const storeModel = new dbModel(params, articles);
    const storeData = await storeModel.storeAny();
    if (!storeData?.acknowledged) throw new Error(`Failed to store article URL: ${articleURL}`);

    console.log(`STORED ARTICLE URL: ${articleURL} | ARTICLE ID: ${articleId}`);
  } catch (e) {
    console.log("MONGO ERROR FOR ARTICLE: " + articleURL);
    console.log(e.message);
    throw e;
  }

  return params;
};

const buildAbsoluteURL = (href, baseURL) => {
  if (!href || !baseURL) return null;

  try {
    return new URL(href, baseURL).href;
  } catch (error) {
    console.log(`INVALID KCNA URL: ${href}`);
    return null;
  }
};

//++++++++++++++++++++++++++++++++++

export const scrapeArticleContentKCNA = async () => {
  const articles = process.env.ARTICLES_COLLECTION;
  if (!kcnaState.scrapeActive) return null;

  const newArticleArray = await fetchIncompleteArticles(articles);
  if (!newArticleArray) return null;

  console.log("NEW ARTICLE ARRAY: " + newArticleArray.length);

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

const fetchIncompleteArticles = async (articles) => {
  const missingTitleModel = new dbModel({ keyExists: "url", keyEmpty: "title" }, articles);
  const missingTextModel = new dbModel({ keyExists: "url", keyEmpty: "text" }, articles);
  const missingPicsModel = new dbModel({ keyExists: "picPageURL", arrayKey: "picArray" }, articles);
  const missingTitles = await missingTitleModel.findEmptyItems();
  const missingTexts = await missingTextModel.findEmptyItems();
  const missingPics = await missingPicsModel.findEmptyArrayItems();
  return mergeUniqueItems(missingTitles, missingTexts, missingPics);
};

const mergeUniqueItems = (...itemArrays) => {
  const uniqueItems = new Map();
  for (const itemArray of itemArrays) {
    if (!itemArray) continue;
    for (const item of itemArray) uniqueItems.set(item.url, item);
  }
  return uniqueItems.size ? [...uniqueItems.values()] : null;
};

export const parseArticleContent = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date } = inputObj;
  const articles = process.env.ARTICLES_COLLECTION;

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();
  if (!html) {
    console.log(`FAILED TO GET HTML FOR URL: ${url}`);
    return null;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const articleTitle = extractArticleTitle(document);
  const articleText = extractArticleText(document);
  if (!articleTitle || !articleText) return null;

  const articlePicPage = extractArticlePicPage(document);
  const articlePicArray = await extractArticlePicArray(articlePicPage, date);
  if (articlePicPage && !articlePicArray?.length) return null;

  const params = {
    title: articleTitle,
    text: articleText,
  };

  if (articlePicArray) {
    params.picPageURL = articlePicPage;
    params.picArray = articlePicArray;
  }

  const isStored = await storeArticleContent(url, params, articles);
  return isStored ? params : null;
};

const storeArticleContent = async (url, params, articles) => {
  try {
    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: params }, articles);
    const storeData = await storeModel.updateObjItem();
    const isStored = Boolean(storeData?.acknowledged && storeData.matchedCount > 0);
    const status = isStored ? "STORED" : "NOT STORED";
    const textLength = params.text?.length ?? 0;
    console.log(`ARTICLE CONTENT ${status}: ${url} | TEXT: ${textLength} CHARS | PICS: ${params.picArray?.length ?? 0}`);
    return isStored;
  } catch (e) {
    console.log("MONGO ERROR FOR ARTICLE: " + url);
    console.log(e.message);
    return false;
  }
};

export const extractArticleTitle = (document) => {
  const titleElement = document.querySelector("main article .container h1, .article-main-title");
  const articleTitle = titleElement?.textContent?.replace(/\s+/g, " ").trim();
  return articleTitle ?? null;
};

export const extractArticleText = (document) => {
  const currentTextElement = document.querySelector("main article .container");
  const textElement = currentTextElement ?? document.querySelector(".content-wrapper");
  if (!textElement) return "";
  const selector = currentTextElement ? ":scope > p" : "p";
  const textArray = textElement.querySelectorAll(selector);

  const paragraphArray = [];
  for (let i = 0; i < textArray.length; i++) {
    paragraphArray.push(textArray[i].textContent.trim());
  }

  return paragraphArray.join("\n\n");
};

export const extractArticlePicPage = (document) => {
  const currentLink = document.querySelector("main article a[href*='/gallery/detail/']");
  const legacyLink = document.querySelector(".media-icon a[href]");
  const picPageHref = (currentLink ?? legacyLink)?.getAttribute("href");
  return buildAbsoluteURL(picPageHref, process.env.KCNA_BASE_URL);
};

export const extractArticlePicArray = async (url, date) => {
  const pics = process.env.PICS_COLLECTION;
  if (!url) return null;

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();

  if (!html) {
    console.log(`FAILED TO GET HTML FOR URL: ${url}`);
    return null;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const picArray = [];
  const imgArray = document.querySelectorAll(".thumbnail-img img[src]");
  for (let i = 0; i < imgArray.length; i++) {
    if (!kcnaState.scrapeActive) return null;

    const imgSrc = imgArray[i].getAttribute("src");
    if (!imgSrc) continue;

    const articlePicURL = buildAbsoluteURL(imgSrc, url);
    if (!articlePicURL) continue;

    await storeArticlePic(articlePicURL, date, pics);
    if (!kcnaState.scrapeActive) return null;
    picArray.push(articlePicURL);
  }

  return picArray;
};

const storeArticlePic = async (url, date, pics) => {
  const picId = await buildNumericId("pics");
  const picParams = { picId, url, scrapeId: kcnaState.scrapeId, date };

  try {
    const storePicModel = new dbModel(picParams, pics);
    const storeData = await storePicModel.storeUniqueURL();
    if (storeData && !storeData.acknowledged) throw new Error(`Failed to store article photo: ${url}`);
  } catch (e) {
    console.log("MONGO ERROR FOR ARTICLE PIC: " + url);
    console.log(e.message);
    throw e;
  }
};

//+++++++++++++++++++++++++++++++++++

export const uploadArticlesKCNA = async () => {
  const articles = process.env.ARTICLES_COLLECTION; const tgChannelId = process.env.TG_CHANNEL_ID;
  if (!kcnaState.scrapeActive) return null;

  console.log("UPLOADING ARTICLES KCNA");

  const articleModel = new dbModel({ keyExists: "url", keyEmpty: "uploaded" }, articles);
  const articleArray = await articleModel.findEmptyItems();
  if (!articleArray || !articleArray.length) return null;

  console.log("ARTICLE ARRAY TO UPLOAD: " + articleArray.length);

  const sortArray = sortArrayByDate(articleArray);
  if (!sortArray) return null;

  const articlePostArray = [];
  for (const articleObj of sortArray) {
    console.log("UPLOADING ARTICLE: " + articleObj.url);
    const { url } = articleObj;
    if (!kcnaState.scrapeActive) return articlePostArray;

    const uploadObj = { ...articleObj, tgChannelId };
    const storeProgress = (telegramDelivery) => storeArticleUpdate(url, { telegramDelivery }, articles);
    const isPosted = await postArticleTG(uploadObj, storeProgress);
    if (!isPosted) continue;

    const postData = buildArticleUploadData(articleObj);
    const isStored = await storeArticleUpdate(url, postData, articles);
    if (!isStored) continue;

    articlePostArray.push(postData);
  }

  kcnaState.scrapeStep = "PIC SET UPLOAD KCNA";
  kcnaState.scrapeMessage = `FINISHED UPLOADING ${articlePostArray.length} NEW ARTICLES TO TG`;
  await updateLogKCNA();

  return articlePostArray;
};

const storeArticleUpdate = async (url, updateObj, collection) => {
  try {
    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj }, collection);
    const storeData = await storeModel.updateObjItem();
    return Boolean(storeData?.acknowledged && storeData.matchedCount > 0);
  } catch (e) {
    console.log("MONGO ERROR FOR ARTICLE UPLOAD: " + url);
    console.log(e.message);
    return false;
  }
};

const buildArticleUploadData = (articleObj) => {
  const { tgChannelId, url, date, ...storedArticle } = articleObj;
  const tgInputs = normalizeInputsTG(url, date);
  return { ...storedArticle, url, date, ...tgInputs, uploaded: true };
};

export const postArticleTG = async (inputObj, storeProgress = async () => true) => {
  if (!inputObj) return null;
  const { url, date, picArray = [], telegramDelivery = {} } = inputObj;
  const tgInputs = normalizeInputsTG(url, date);
  const uploadObj = { ...inputObj, ...tgInputs };
  const progress = {
    titleSent: Boolean(telegramDelivery.titleSent),
    photosSent: telegramDelivery.photosSent ?? 0,
    contentChunksSent: telegramDelivery.contentChunksSent ?? 0,
  };

  if (!progress.titleSent) {
    const titleData = await postArticleTitleTG(uploadObj);
    if (!titleData) return false;
    progress.titleSent = true;
    if (!(await storeProgress({ ...progress }))) return false;
  }

  const arePicsPosted = await postArticlePicsTG(uploadObj, progress, storeProgress);
  if (!arePicsPosted) return false;

  const contentData = await postArticleContentTG(uploadObj, progress.contentChunksSent, async (sentCount) => {
    progress.contentChunksSent = sentCount;
    return storeProgress({ ...progress });
  });
  return Boolean(contentData?.length);
};

export const postArticleTitleTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId } = inputObj;

  try {
    const titleText = buildArticleTitleText(inputObj);

    const params = {
      chat_id: tgChannelId,
      text: titleText,
      parse_mode: "HTML",
    };

    const data = await tgSendMessage(params);
    return data;
  } catch (e) {
    console.log(e.message);
    return null;
  }
};

export const postArticlePicsTG = async (inputObj, progress = { photosSent: 0 }, storeProgress = async () => true) => {
  if (!inputObj) return false;
  const { picArray = [] } = inputObj;

  for (let i = progress.photosSent; i < picArray.length; i++) {
    if (!kcnaState.scrapeActive) return false;

    const picObj = buildArticlePicUpload(inputObj, i);
    if (!picObj) return false;

    const data = await postPicArrayTG([picObj]);
    if (!data?.length) return false;

    progress.photosSent = i + 1;
    if (!(await storeProgress({ ...progress }))) return false;
  }

  return true;
};

const buildArticlePicUpload = (inputObj, index) => {
  const { picArray, tgChannelId } = inputObj;
  const picObj = { ...picArray[index], picIndex: index + 1, picCount: picArray.length, tgChannelId };
  const caption = buildArticlePicCaption(picObj);
  if (!caption) return null;
  return { ...picObj, caption };
};

export const postArticleContentTG = async (inputObj, startIndex = 0, storeChunk = async () => true) => {
  if (!inputObj || !inputObj.text) return null;
  const { tgChannelId } = inputObj;
  const messageArray = buildArticleContentMessages(inputObj);
  if (!messageArray || !messageArray.length || startIndex > messageArray.length) return null;
  if (startIndex === messageArray.length) return [{ alreadySent: true }];

  const postArray = [];
  for (let i = startIndex; i < messageArray.length; i++) {
    if (!kcnaState.scrapeActive) return null;

    const data = await tgSendMessage({ chat_id: tgChannelId, text: messageArray[i], parse_mode: "HTML" });
    if (!data) return null;
    if (!(await storeChunk(i + 1))) return null;

    postArray.push({ chunkData: data, chunkIndex: i, chunkTotal: messageArray.length });
  }

  return postArray;
};

const buildArticleContentMessages = (inputObj) => {
  const tgMaxLength = Number(process.env.TG_MAX_LENGTH);
  if (!Number.isInteger(tgMaxLength) || tgMaxLength <= 0) return null;

  const header = "<b>[ARTICLE TEXT]:</b>\n\n";
  const footer = "\n\n<b>URL:</b> <i>" + escapeTelegramHTML(inputObj.urlNormal) + "</i>";
  const bodyCapacity = tgMaxLength - header.length - footer.length;
  if (bodyCapacity <= 0) return null;

  const chunkArray = splitEscapedText(inputObj.text, bodyCapacity);
  if (!chunkArray) return null;

  const messageArray = [];
  for (let i = 0; i < chunkArray.length; i++) {
    const chunkObj = { ...inputObj, chunkTotal: chunkArray.length };
    messageArray.push(buildChunkText(chunkArray[i], chunkObj, i, true));
  }
  return messageArray;
};

const splitEscapedText = (text, maxLength) => {
  const chunkArray = [];
  let chunk = "";
  for (const character of String(text)) {
    const escapedCharacter = escapeTelegramHTML(character);
    if (escapedCharacter.length > maxLength) return null;
    if (chunk.length + escapedCharacter.length > maxLength) {
      chunkArray.push(chunk);
      chunk = "";
    }
    chunk += escapedCharacter;
  }
  if (chunk) chunkArray.push(chunk);
  return chunkArray;
};

//--------------------------------

export const buildArticleTitleText = (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, articleType, articleId, urlNormal } = inputObj;
  const safeTitle = escapeTelegramHTML(title);
  const safeDate = escapeTelegramHTML(dateNormal);
  const safeType = escapeTelegramHTML(articleType);
  const safeId = escapeTelegramHTML(articleId);
  const safeURL = escapeTelegramHTML(urlNormal);

  const titleText = `🇰🇵 🇰🇵 🇰🇵

-----------------

<b>${safeTitle}</b>

-----------------

<b>KCNA ARTICLE:</b> ${safeType} | <b>ID:</b> ${safeId} | <b>DATE:</b> <i>${safeDate}</i> | <b>URL:</b>
<i>${safeURL}</i>
  `;

  return titleText;
};

export const buildArticlePicCaption = (inputObj) => {
  if (!inputObj) return null;
  const { picIndex, picCount, date, url } = inputObj;

  const normalInputs = normalizeInputsTG(url, date);
  if (!normalInputs) return null;
  const { dateNormal, urlNormal } = normalInputs;

  const articlePicCaption = `
<b>ARTICLE PIC: ${picIndex} OF ${picCount}</b> | <b>DATE:</b> <i>${dateNormal}</i> | <b>PIC URL:</b>
<i>${escapeTelegramHTML(urlNormal)}</i>
`;

  return articlePicCaption;
};

export const buildChunkText = (chunk, inputObj, chunkIndex, isEscaped = false) => {
  if (!inputObj) return null;
  const { urlNormal, chunkTotal } = inputObj;

  const isFirst = chunkIndex === 0;
  const isLast = chunkIndex === chunkTotal - 1;

  let text = isEscaped ? chunk : escapeTelegramHTML(chunk);
  if (isFirst) text = "<b>[ARTICLE TEXT]:</b>\n\n" + text;
  if (isLast) text = text + "\n\n<b>URL:</b> <i>" + escapeTelegramHTML(urlNormal) + "</i>";
  return text;
};

const escapeTelegramHTML = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
};
