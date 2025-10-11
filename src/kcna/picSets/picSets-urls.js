import { JSDOM } from "jsdom";

import CONFIG from "../../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../util/state.js";

import { extractItemDate, getIdFromURL } from "../util/util.js";
import { updateDisplayerKCNA } from "../util/api.js";

export const scrapePicSetURLsKCNA = async () => {
  const { picSetListURL } = CONFIG;

  if (!kcnaState.scrapeActive) return null;

  try {
    const kcna = new NORK({ url: picSetListURL });
    const html = await kcna.getHTML();

    const picSetListData = await parsePicSetList(html);
    if (!picSetListData) return null;

    kcnaState.scrapeStep = "PIC SET CONTENT KCNA";
    kcnaState.scrapeMessage = `FINISHED SCRAPING ${picSetListData.length} NEW PIC SET URLS`;
    await updateDisplayerKCNA(kcnaState);

    return picSetListData;
  } catch (e) {
    console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    return null;
  }
};

export const parsePicSetList = async (html) => {
  try {
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
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const extractPicSetListArray = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;
  const { picSets } = CONFIG;

  const picSetURLArray = [];
  for (const picSetElement of inputArray) {
    if (!kcnaState.scrapeActive) return picSetURLArray;

    try {
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
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  return picSetURLArray;
};
