import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
// import { picSetURLs } from "../../config/urls.js";
import kcnaState from "../util/state.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { updateLogKCNA } from "../util/log.js";
import { buildNumericId, extractItemDate } from "../util/util.js";

export const scrapePicSetURLsKCNA = async (inputObj) => {
  if (!kcnaState.scrapeActive) return null;
  console.log("SCRAPING KCNA PIC SETS; GETTING URLS");

  let picSetCount = 0;
  const picSetTypeData = [];
  for (const typeObj of inputObj) {
    const { typeArr, pageArray } = typeObj;
    const type = typeArr.slice(0, -3);

    console.log("TYPE: " + type + " | PAGE ARRAY LENGTH: " + pageArray.length);

    for (const pageURL of pageArray) {
      if (!kcnaState.scrapeActive) return picSetTypeData;

      const picSetListArray = await parsePicSetListPage(pageURL, type);

      if (!picSetListArray) continue;
      picSetCount += picSetListArray.length;

      picSetTypeData.push(...picSetListArray);
    }

    console.log(`PIC SET TYPE: ${type} | COUNT: ${picSetCount}`);
  }

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

  const photoWrapperArray = document.querySelectorAll(".photo-wrapper");
  if (!photoWrapperArray || !photoWrapperArray.length) return null;

  const picSetListArray = [];
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
  const { kcnaBaseURL, picSets } = CONFIG;

  const titleWrapper = linkElement.querySelector(".title a");
  const picSetLink = titleWrapper.getAttribute("href");
  const picSetDate = await extractItemDate(linkElement);
  const picSetURL = kcnaBaseURL + picSetLink;

  const checkModel = new dbModel({ url: picSetURL }, picSets);
  const checkData = await checkModel.urlExistsCheck();
  if (checkData) return null;

  const picSetId = await buildNumericId("picSets");

  const params = {
    url: picSetURL,
    pageURL: pageURL,
    date: picSetDate,
    picSetType: type,
    scrapeId: kcnaState.scrapeId,
    picSetId: picSetId,
  };

  console.log("PIC SET LIST PARAMS");
  console.log(params);

  try {
    const storeModel = new dbModel(params, picSets);
    const storeData = await storeModel.storeUniqueURL();

    console.log("PIC SET LIST STORE DATA");
    console.log(storeData);
  } catch (e) {
    console.log("MONGO ERROR FOR PIC SET: " + picSetURL);
    console.log(e.message);
  }

  return params;
};

//+++++++++++++++++++++++++++++++++++++++++

export const scrapePicSetContentKCNA = async () => {
  const { picSets } = CONFIG;
  if (!kcnaState.scrapeActive) return null;

  //find new article urls by those without text content
  const newPicSetModel = new dbModel({ keyExists: "url", keyEmpty: "picArray" }, picSets);
  const newPicSetArray = await newPicSetModel.findEmptyItems();
  if (!newPicSetArray || !newPicSetArray.length) return null;

  console.log("NEW PIC SET ARRAY");
  console.log(newPicSetArray.length);

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

export const parsePicSetContent = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date } = inputObj;
  const { picSets } = CONFIG;

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();
  if (!html) {
    console.log(`FAILED TO GET HTML FOR URL: ${url}`);
    return null;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const picSetTitle = await extractPicSetTitle(document);
  const picSetPicArray = await extractPicSetPicArray(document, date);

  const picSetParams = {
    title: picSetTitle,
    picArray: picSetPicArray,
  };

  try {
    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: picSetParams }, picSets);
    const storeData = await storeModel.updateObjItem();
    console.log("PIC SET CONTENT STORE DATA");
    console.log(storeData);
  } catch (e) {
    console.log("MONGO ERROR FOR PIC SET: " + url);
    console.log(e.message);
  }

  return picSetParams;
};

export const extractPicSetTitle = async (document) => {
  if (!document) return null;

  const titleElement = document.querySelector(".title .main span");
  if (!titleElement) return null;

  return titleElement.textContent.trim();
};

export const extractPicSetPicArray = async (document, date) => {
  if (!document || !date) return null;
  const { pics, kcnaBaseURL } = CONFIG;

  const picElementArray = document.querySelectorAll(".content img");

  const picSetPicArray = [];
  for (const picElement of picElementArray) {
    if (!kcnaState.scrapeActive) return picSetPicArray;

    const picSrc = picElement.getAttribute("src");
    if (!picSrc) continue;
    const picSetPicURL = kcnaBaseURL + picSrc;
    picSetPicArray.push(picSetPicURL);

    //store urls to picDB (so dont have to do again); build params
    const picId = await buildNumericId("pics");
    const picParams = {
      picId: picId,
      url: picSetPicURL,
      scrapeId: kcnaState.scrapeId,
      date: date,
    };

    console.log("PIC SET PIC PARAMS");
    console.log(picParams);

    try {
      const storePicModel = new dbModel(picParams, pics);
      const storeData = await storePicModel.storeUniqueURL();
      console.log("STORE PIC DATA");
      console.log(storeData);
    } catch (e) {
      console.log("MONGO ERROR FOR PIC SET PIC: " + picSetPicURL);
      console.log(e.message);
    }
  }

  return picSetPicArray;
};

//+++++++++++++++++++++++++++++++++

export const uploadPicSetsKCNA = async () => {};
