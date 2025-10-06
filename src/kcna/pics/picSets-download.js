import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../state.js";
import { extractItemDate, lookupItemDate, getIdFromURL } from "../util.js";

export const scrapePicSetContentKCNA = async () => {
  if (!inputArray || !inputArray.length) return null;


  const newPicSetModel = new dbModel({ keyExists: "url", keyEmpty: "picArray" }, picSets);
  const newPicSetArray = await newPicSetModel.findEmptyItems();

  // const picSetContentArray = await scrapePicSetContent(newPicSetArray);
  // console.log("PIC SET CONTENT ARRAY");
  console.log(picSetContentArray);
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
