import { JSDOM } from "jsdom";

import kcnaState from "../util/state.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { tgSendMessage } from "../tg-api.js";
import { postPicArrayTG } from "./pics.js";
import { updateLogKCNA } from "../util/log.js";
import { buildNumericId, extractItemDate, sortArrayByDate, normalizeInputsTG } from "../util/util.js";

export const scrapePicSetURLsKCNA = async (inputObj) => {
  if (!kcnaState.scrapeActive) return null;
  console.log("SCRAPING KCNA PIC SETS; GETTING URLS");

  let picSetCount = 0;
  let candidateCount = 0;
  const picSetTypeData = [];
  for (const typeObj of inputObj) {
    const { typeKey, pageArray } = typeObj;
    const type = typeKey.slice(0, -3);

    console.log("TYPE: " + type + " | PAGE ARRAY LENGTH: " + pageArray.length);

    for (const pageURL of pageArray) {
      if (!kcnaState.scrapeActive) return picSetTypeData;

      const picSetListArray = await parsePicSetListPage(pageURL, type);

      if (!picSetListArray) continue;
      const pageCandidates = picSetListArray.candidateCount ?? 0;
      console.log(`PIC SET LIST PAGE: ${pageURL} | NEW: ${picSetListArray.length} OF ${pageCandidates}`);
      candidateCount += pageCandidates;
      picSetCount += picSetListArray.length;

      picSetTypeData.push(...picSetListArray);
    }

    console.log(`PIC SET TYPE: ${type} | COUNT: ${picSetCount}`);
  }

  if (!candidateCount) throw new Error("Gallery listing produced zero candidates");

  kcnaState.scrapeStep = "PIC SET CONTENT KCNA";
  kcnaState.scrapeMessage = `FINISHED SCRAPING ${picSetCount} NEW PIC SET URLS`;
  await updateLogKCNA();

  return picSetTypeData;
};

export const parsePicSetListPage = async (pageURL, type) => {
  if (!pageURL || !type) return null;

  const htmlModel = new NORK({ url: pageURL });
  const html = await htmlModel.getHTML();
  if (!html) {
    console.log(`FAILED TO GET HTML FOR URL: ${pageURL}`);
    return null;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const photoWrapperArray = document.querySelectorAll(".thumb a[href*='/gallery/detail/']");
  if (!photoWrapperArray.length) return [];

  const picSetListArray = [];
  picSetListArray.candidateCount = photoWrapperArray.length;
  for (const linkElement of photoWrapperArray) {
    if (!kcnaState.scrapeActive) return picSetListArray;

    const picSetLinkObj = await parsePicSetLinkElement(linkElement, pageURL, type);
    if (!picSetLinkObj) continue;
    picSetListArray.push(picSetLinkObj);
  }

  return picSetListArray;
};

export const parsePicSetLinkElement = async (linkElement, pageURL, type) => {
  if (!linkElement || !pageURL || !type) return null;
  const picSets = process.env.PICSETS_COLLECTION;

  const picSetLink = linkElement.getAttribute("href");
  const picSetDate = extractItemDate(linkElement.closest(".gallery") ?? linkElement);
  const picSetURL = buildAbsoluteURL(picSetLink, pageURL);
  if (!picSetURL) return null;

  const checkModel = new dbModel({ url: picSetURL }, picSets);
  const exists = await checkModel.urlExists();
  if (exists) return null;

  const picSetId = await buildNumericId("picSets");

  const params = {
    url: picSetURL,
    pageURL: pageURL,
    date: picSetDate,
    picSetType: type,
    scrapeId: kcnaState.scrapeId,
    picSetId: picSetId,
  };

  try {
    const storeModel = new dbModel(params, picSets);
    const storeData = await storeModel.storeAny();
    if (!storeData?.acknowledged) throw new Error(`Failed to store gallery URL: ${picSetURL}`);

    console.log(`STORED PIC SET URL: ${picSetURL} | PIC SET ID: ${picSetId}`);
  } catch (e) {
    console.log("MONGO ERROR FOR PIC SET: " + picSetURL);
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

//+++++++++++++++++++++++++++++++++++++++++

export const scrapePicSetContentKCNA = async () => {
  const picSets = process.env.PICSETS_COLLECTION;
  if (!kcnaState.scrapeActive) return null;

  const newPicSetArray = await fetchIncompletePicSets(picSets);
  if (!newPicSetArray) return null;

  console.log("NEW PIC SET ARRAY: " + newPicSetArray.length);

  let picSetCount = 0;
  const picSetContentArray = [];
  for (const picSetObj of newPicSetArray) {
    if (!kcnaState.scrapeActive) return picSetContentArray;

    const picSetContentData = await parsePicSetContent(picSetObj);
    if (!picSetContentData) continue;
    picSetCount++;

    picSetContentArray.push(picSetContentData);
  }

  return picSetContentArray;
};

const fetchIncompletePicSets = async (picSets) => {
  const missingTitleModel = new dbModel({ keyExists: "url", keyEmpty: "title" }, picSets);
  const missingPicsModel = new dbModel({ keyExists: "url", arrayKey: "picArray" }, picSets);
  const missingTitles = await missingTitleModel.findEmptyItems();
  const missingPics = await missingPicsModel.findEmptyArrayItems();
  return mergeUniqueItems(missingTitles, missingPics);
};

const mergeUniqueItems = (...itemArrays) => {
  const uniqueItems = new Map();
  for (const itemArray of itemArrays) {
    if (!itemArray) continue;
    for (const item of itemArray) uniqueItems.set(item.url, item);
  }
  return uniqueItems.size ? [...uniqueItems.values()] : null;
};

export const parsePicSetContent = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date } = inputObj;
  const picSets = process.env.PICSETS_COLLECTION;

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();
  if (!html) {
    console.log(`FAILED TO GET HTML FOR URL: ${url}`);
    return null;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const picSetTitle = extractPicSetTitle(document);
  if (!picSetTitle) return null;

  const picSetPicArray = await extractPicSetPicArray(document, date);
  if (!picSetPicArray?.length) return null;

  const picSetParams = {
    title: picSetTitle,
    picArray: picSetPicArray,
  };

  const isStored = await storePicSetContent(url, picSetParams, picSets);
  return isStored ? picSetParams : null;
};

const storePicSetContent = async (url, params, picSets) => {
  try {
    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: params }, picSets);
    const storeData = await storeModel.updateObjItem();
    const isStored = Boolean(storeData?.acknowledged && storeData.matchedCount > 0);
    const status = isStored ? "STORED" : "NOT STORED";
    console.log(`PIC SET CONTENT ${status}: ${url} | PICS: ${params.picArray?.length ?? 0}`);
    return isStored;
  } catch (e) {
    console.log("MONGO ERROR FOR PIC SET: " + url);
    console.log(e.message);
    return false;
  }
};

export const extractPicSetTitle = (document) => {
  if (!document) return null;

  const titleElement = document.querySelector(".thumbnail-img img[alt]");
  const currentTitle = titleElement?.getAttribute("alt")?.trim();
  if (currentTitle) return currentTitle;

  const legacyTitle = document.querySelector(".title .main span");
  return legacyTitle?.textContent?.trim() ?? null;
};

export const extractPicSetPicArray = async (document, date) => {
  if (!document || !date) return null;
  const pics = process.env.PICS_COLLECTION;

  const currentPics = document.querySelectorAll(".thumbnail-img img[src]");
  const picElementArray = currentPics.length ? currentPics : document.querySelectorAll(".content img[src]");

  const picSetPicArray = [];
  for (const picElement of picElementArray) {
    if (!kcnaState.scrapeActive) return null;

    const picSrc = picElement.getAttribute("src");
    if (!picSrc) continue;
    const picSetPicURL = buildAbsoluteURL(picSrc, process.env.KCNA_BASE_URL);
    if (!picSetPicURL) continue;
    await storePicSetPic(picSetPicURL, date, pics);
    if (!kcnaState.scrapeActive) return null;
    picSetPicArray.push(picSetPicURL);
  }

  return picSetPicArray;
};

const storePicSetPic = async (url, date, pics) => {
  const picId = await buildNumericId("pics");
  const picParams = { picId, url, scrapeId: kcnaState.scrapeId, date };

  try {
    const storePicModel = new dbModel(picParams, pics);
    const storeData = await storePicModel.storeUniqueURL();
    if (storeData && !storeData.acknowledged) throw new Error(`Failed to store gallery photo: ${url}`);
  } catch (e) {
    console.log("MONGO ERROR FOR PIC SET PIC: " + url);
    console.log(e.message);
    throw e;
  }
};

//+++++++++++++++++++++++++++++++++

export const uploadPicSetsKCNA = async () => {
  const picSets = process.env.PICSETS_COLLECTION; const tgChannelId = process.env.TG_CHANNEL_ID;
  if (!kcnaState.scrapeActive) return null;

  const picSetModel = new dbModel({ keyExists: "url", keyEmpty: "uploaded" }, picSets);
  const picSetArray = await picSetModel.findEmptyItems();
  if (!picSetArray || !picSetArray.length) return null;

  console.log("PIC SET ARRAY TO UPLOAD: " + picSetArray.length);

  const picSetArraySorted = sortArrayByDate(picSetArray, "picSets");
  if (!picSetArraySorted) return null;

  const picSetPostArray = [];
  for (const picSetObj of picSetArraySorted) {
    console.log("UPLOADING PIC SET: " + picSetObj.url);
    if (!kcnaState.scrapeActive) return picSetPostArray;

    const { url } = picSetObj;

    const uploadObj = { ...picSetObj, tgChannelId };
    const storeProgress = (telegramDelivery) => storePicSetUpdate(url, { telegramDelivery }, picSets);
    const isPosted = await postPicSetTG(uploadObj, storeProgress);
    if (!isPosted) continue;

    const picSetPostData = buildPicSetUploadData(picSetObj);
    const isStored = await storePicSetUpdate(url, picSetPostData, picSets);
    if (!isStored) continue;

    picSetPostArray.push(picSetPostData);
  }

  kcnaState.scrapeStep = "VID PAGE UPLOAD KCNA";
  kcnaState.scrapeMessage = `FINISHED UPLOADING ${picSetPostArray.length} NEW PIC SETS TO TG`;
  await updateLogKCNA();

  return picSetPostArray;
};

const storePicSetUpdate = async (url, updateObj, collection) => {
  try {
    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj }, collection);
    const storeData = await storeModel.updateObjItem();
    return Boolean(storeData?.acknowledged && storeData.matchedCount > 0);
  } catch (e) {
    console.log("MONGO ERROR FOR PIC SET UPLOAD: " + url);
    console.log(e.message);
    return false;
  }
};

const buildPicSetUploadData = (picSetObj) => {
  const { tgChannelId, url, date, ...storedPicSet } = picSetObj;
  const tgInputs = normalizeInputsTG(url, date);
  return { ...storedPicSet, url, date, ...tgInputs, uploaded: true };
};

export const postPicSetTG = async (inputObj, storeProgress = async () => true) => {
  if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return false;
  const { url, date, picArray, telegramDelivery = {} } = inputObj;
  const tgInputs = normalizeInputsTG(url, date);
  const uploadObj = { ...inputObj, ...tgInputs };
  const progress = {
    titleSent: Boolean(telegramDelivery.titleSent),
    photosSent: telegramDelivery.photosSent ?? 0,
  };

  if (!progress.titleSent) {
    const titleData = await postPicSetTitleTG(uploadObj);
    if (!titleData) return false;
    progress.titleSent = true;
    if (!(await storeProgress({ ...progress }))) return false;
  }

  return postPicSetPicsTG(uploadObj, progress, storeProgress);
};

export const postPicSetTitleTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId } = inputObj;

  try {
    const titleText = buildPicSetTitleText(inputObj);

    const params = {
      chat_id: tgChannelId,
      text: titleText,
      parse_mode: "HTML",
    };

    return await tgSendMessage(params);
  } catch (e) {
    console.log(e.message);
    return null;
  }
};

export const postPicSetPicsTG = async (inputObj, progress = { photosSent: 0 }, storeProgress = async () => true) => {
  if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return false;
  const { picArray } = inputObj;

  for (let i = progress.photosSent; i < picArray.length; i++) {
    if (!kcnaState.scrapeActive) return false;

    const picObj = buildPicSetPicUpload(inputObj, i);
    if (!picObj) return false;

    const data = await postPicArrayTG([picObj]);
    if (!data?.length) return false;

    progress.photosSent = i + 1;
    if (!(await storeProgress({ ...progress }))) return false;
  }

  return true;
};

const buildPicSetPicUpload = (inputObj, index) => {
  const { picArray, tgChannelId } = inputObj;
  const picObj = { ...picArray[index], picIndex: index + 1, picCount: picArray.length, tgChannelId };
  const caption = buildPicSetPicCaption(picObj);
  if (!caption) return null;
  return { ...picObj, caption };
};

//---------------------------

export const buildPicSetTitleText = (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, picSetId, picArray, urlNormal } = inputObj;
  const safeTitle = escapeTelegramHTML(title);
  const safeDate = escapeTelegramHTML(dateNormal);
  const safeId = escapeTelegramHTML(picSetId);
  const safeURL = escapeTelegramHTML(urlNormal);
  const picCount = picArray.length;

  const titleText = `🇰🇵 🇰🇵 🇰🇵

-----------------

<b>${safeTitle}</b>

-----------------

<b>KCNA PIC SET ID:</b> ${safeId} | <b>TOTAL PICS:</b> ${picCount} | <b>DATE:</b> <i>${safeDate}</i> | <b>URL:</b>
<i>${safeURL}</i>
  `;

  return titleText;
};

export const buildPicSetPicCaption = (inputObj) => {
  if (!inputObj) return null;
  const { picIndex, picCount, date, url } = inputObj;

  const normalInputs = normalizeInputsTG(url, date);
  if (!normalInputs) return null;
  const { dateNormal, urlNormal } = normalInputs;

  const picSetPicCaption = `
<b>PIC ${picIndex} OF ${picCount} IN PIC SET</b> | <b>DATE:</b> <i>${dateNormal}</i> | <b>PIC URL:</b>
<i>${escapeTelegramHTML(urlNormal)}</i>
`;

  return picSetPicCaption;
};

const escapeTelegramHTML = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
};
