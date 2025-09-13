import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { kcnaState } from "./kcna-state.js";
import { extractItemDate } from "./util.js";

export const scrapePicsKCNA = async () => {
  const picSetURLs = await scrapePicSetURLs();
  console.log("NEW PIC SET URLS");
  console.log(picSetURLs);
};

export const scrapePicSetURLs = async () => {
  const { picListURL, picSets } = CONFIG;

  try {
    const picSetListArray = await parsePicSetList(picListURL);

    const picSetURLs = [];
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

      picSetURLs.push(params);
    }

    return picSetURLs;
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
    const picSetLink = picSetElement.getAttribute("href");
    const picSetDate = await extractItemDate(picSetElement);
    picSetArray.push({ picSetLink, picSetDate });
  }

  //throw error if no links found
  if (!picSetArray || !picSetArray.length) {
    const error = new Error("CANT EXTRACT ARTICLES FROM ELEMENT");
    error.url = url;
    error.function = "parsePicSetList";
    throw error;
  }

  return picSetArray;
};
