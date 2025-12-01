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

    return params;
  } catch (e) {
    console.log("MONGO ERROR FOR PIC SET: " + picSetURL);
    console.log(e.message);
    return null;
  }
};

//+++++++++++++++++++++++++++++++++++++++++

export const scrapePicSetContentKCNA = async () => {
  //build
};
