import { JSDOM } from "jsdom";

import CONFIG from "../../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../util/state.js";

import { getIdFromURL } from "../util/util.js";
import { updateDisplayerKCNA } from "../util/api.js";

export const scrapePicSetContentKCNA = async () => {
  const { picSets } = CONFIG;
  if (!kcnaState.scrapeActive) return null;

  const newPicSetModel = new dbModel({ keyExists: "url", keyEmpty: "picArray" }, picSets);
  const newPicSetArray = await newPicSetModel.findEmptyItems();
  if (!newPicSetArray || !newPicSetArray.length) return null;

  const picSetContentData = await parseNewPicSetArray(newPicSetArray);
  return picSetContentData;
};

export const parseNewPicSetArray = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const newPicSetArray = [];
  for (const picSet of inputArray) {
    if (!kcnaState.scrapeActive) return newPicSetArray;

    const { url, date } = picSet;
    try {
      const picSetContent = await parsePicSetContent(url, date);
      if (!picSetContent) continue;
      console.log("PIC SET CONTENT");
      console.log(picSetContent);

      newPicSetArray.push(picSetContent);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  kcnaState.scrapeStep = "PIC SETS CONTENT KCNA";
  kcnaState.scrapeMessage = `FINISHED SCRAPING CONTENT FOR ${newPicSetArray.length} NEW PIC SETS`;
  await updateDisplayerKCNA(kcnaState);

  return newPicSetArray;
};

export const parsePicSetContent = async (url, date) => {
  if (!url) return null;
  const { picSets } = CONFIG;

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
  const picSetPicArray = await extractPicSetPicArray(document, date);

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

export const extractPicSetPicArray = async (document, date) => {
  const { pics } = CONFIG;

  const picElementArray = document.querySelectorAll(".content img");

  const picSetPicArray = [];
  for (const picElement of picElementArray) {
    try {
      if (!kcnaState.scrapeActive) return picSetPicArray;

      const picSrc = picElement.getAttribute("src");
      if (!picSrc) continue;
      const picSetPicURL = "http://www.kcna.kp" + picSrc;
      picSetPicArray.push(picSetPicURL);

      //store urls to picDB (so dont have to do again); build params
      const picId = await getIdFromURL(picSetPicURL);
      const storeParams = {
        picId: picId,
        url: picSetPicURL,
        scrapeId: kcnaState.scrapeId,
        date: date,
      };

      console.log("STORE PIC PARAMS");
      console.log(storeParams);

      const storePicModel = new dbModel(storeParams, pics);
      const storeData = await storePicModel.storeUniqueURL();
      console.log("STORE PIC DATA");
      console.log(storeData);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  return picSetPicArray;
};
