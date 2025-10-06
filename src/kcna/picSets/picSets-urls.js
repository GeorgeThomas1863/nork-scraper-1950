import { JSDOM } from "jsdom";

import CONFIG from "../../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../util/state.js";
import { extractItemDate, getIdFromURL } from "../util/util.js";

export const scrapePicSetURLsKCNA = async () => {
  const { picSetListURL } = CONFIG;

  const picSetURLData = [];
  try {
    const picSetListData = await parsePicSetList(picSetListURL);
    if (!picSetListData) return null;

    picSetURLData.push(picSetListData);
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
  if (!photoWrapperArray || !photoWrapperArray.length) return null;

  const picSetListArray = await extractPicSetListArray(photoWrapperArray);
  return picSetListArray;
};

export const extractPicSetListArray = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;
  const { picSets } = CONFIG;

  const picSetURLArray = [];
  for (const picSetElement of inputArray) {
    const titleWrapper = picSetElement.querySelector(".title a");
    const picSetLink = titleWrapper.getAttribute("href");
    const picSetDate = await extractItemDate(picSetElement);
    const picSetURL = "http://www.kcna.kp" + picSetLink;
    const picSetId = await getIdFromURL(picSetURL);

    const params = {
      url: picSetURL,
      date: picSetDate,
      scrapeId: kcnaState.scrapeId,
      picSetId: picSetId,
    };

    console.log("PIC SET LIST PARAMS");
    console.log(params);

    const storeModel = new dbModel(params, picSets);
    const storeData = await storeModel.storeUniqueURL();

    console.log("STORE DATA");
    console.log(storeData);

    picSetURLArray.push(params);
  }

  return picSetURLArray;
};
