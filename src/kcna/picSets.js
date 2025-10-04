import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import kcnaState from "./state.js";
import { extractItemDate, lookupItemDate, getIdFromURL } from "./util.js";

export const scrapePicSetsKCNA = async () => {
  const { picSets } = CONFIG;

  const picSetURLs = await scrapePicSetURLs();
  console.log("NEW PIC SET URLS");
  console.log(picSetURLs);

  const newPicSetModel = new dbModel({ keyExists: "url", keyEmpty: "picArray" }, picSets);
  const newPicSetArray = await newPicSetModel.findEmptyItems();

  const picSetContentArray = await scrapePicSetContent(newPicSetArray);
  console.log("PIC SET CONTENT ARRAY");
  console.log(picSetContentArray);

  return picSetContentArray;
};

export const scrapePicSetURLs = async () => {
  const { picListURL, picSets } = CONFIG;

  try {
    const picSetListArray = await parsePicSetList(picListURL);

    const picSetURLArray = [];
    for (const picSet of picSetListArray) {
      const { picSetLink, picSetDate } = picSet;
      const picSetURL = "http://www.kcna.kp" + picSetLink;
      const params = {
        url: picSetURL,
        date: picSetDate,
        scrapeId: kcnaState.scrapeId,
      };

      console.log("PARAMS");
      console.log(params);

      const storeModel = new dbModel(params, picSets);
      const storeData = await storeModel.storeUniqueURL();
      console.log("STORE DATA");
      console.log(storeData);

      picSetURLArray.push(params);
    }

    return picSetURLArray;
  } catch (e) {
    console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    return null;
  }
};

export const parsePicSetList = async (url) => {
  if (!url) return null;

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();

  if (!html) {
    const error = new Error("FAILED TO GET PIC SET LIST HTML ");
    error.url = url;
    error.function = "parsePicSetList";
    throw error;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const photoWrapperArray = document.querySelectorAll(".photo-wrapper");

  //throw error if no pic Pages found
  if (!photoWrapperArray || !photoWrapperArray.length) {
    const error = new Error("CANT EXTRACT PICSET LIST");
    error.url = url;
    error.function = "parsePicSetList";
    throw error;
  }

  const picSetArray = [];
  for (const picSetElement of photoWrapperArray) {
    const titleWrapper = picSetElement.querySelector(".title a");
    const picSetLink = titleWrapper.getAttribute("href");
    const picSetDate = await extractItemDate(picSetElement);
    picSetArray.push({ picSetLink, picSetDate });
  }

  console.log("PIC SET ARRAY");
  console.log(picSetArray);

  //throw error if no links found
  if (!picSetArray || !picSetArray.length) {
    const error = new Error("CANT EXTRACT PIC SET FROM ELEMENT");
    error.url = url;
    error.function = "parsePicSetList";
    throw error;
  }

  return picSetArray;
};

//------------------------------

export const scrapePicSetContent = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const picSetContentArray = [];
  for (const picSet of inputArray) {
    const { url } = picSet;
    try {
      const picSetContent = await parsePicSetContent(url);
      if (!picSetContent) continue;
      console.log("PIC SET CONTENT");
      console.log(picSetContent);

      picSetContentArray.push(picSetContent);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }
  return picSetContentArray;
};

export const parsePicSetContent = async (url) => {
  if (!url) return null;
  const { picSets } = CONFIG;

  // console.log("CONTENT URL");
  // console.log(url);

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();

  if (!html) {
    const error = new Error("FAILED TO GET PIC SET ITEM HTML ");
    error.url = url;
    error.function = "parsePicSetContent";
    throw error;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const picSetTitle = await extractPicSetTitle(document);
  const picSetPicArray = await extractPicSetPicArray(document, url);

  const storeParams = {
    title: picSetTitle,
    picArray: picSetPicArray,
  };

  const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: storeParams }, picSets);
  const storeData = await storeModel.updateObjItem();
  console.log("STORE DATA");
  console.log(storeData);

  return storeParams;
};

export const extractPicSetTitle = async (document) => {
  const titleElement = document.querySelector(".title .main span");
  if (titleElement) {
    return titleElement.textContent.trim();
  }
  return null;
};

export const extractPicSetPicArray = async (document, url) => {
  const { pics } = CONFIG;

  const picElementArray = document.querySelectorAll(".content img");

  const picSetPicArray = [];
  for (const picElement of picElementArray) {
    try {
      const picSrc = picElement.getAttribute("src");
      if (!picSrc) continue;
      const picSetPicURL = "http://www.kcna.kp" + picSrc;
      picSetPicArray.push(picSetPicURL);

      const picDate = await lookupItemDate(url, "picSets");

      //store url to picDB (so dont have to do again); build params
      const picId = await getIdFromURL(picSetPicURL);
      const storeParams = {
        picId: picId,
        url: picSetPicURL,
        scrapeId: kcnaState.scrapeId,
        date: picDate,
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

  return picSetPicArray;
};
