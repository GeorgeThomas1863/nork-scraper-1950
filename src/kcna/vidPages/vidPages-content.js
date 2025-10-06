import { JSDOM } from "jsdom";

import CONFIG from "../../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../util/state.js";
import { getIdFromURL } from "../util/util.js";

export const scrapeVidPageContentKCNA = async () => {
  const { vidPages } = CONFIG;
  const newVidPageModel = new dbModel({ keyExists: "url", keyEmpty: "vidURL" }, vidPages);
  const newVidPageArray = await newVidPageModel.findEmptyItems();
  if (!newVidPageArray || !newVidPageArray.length) return null;

  const vidPageContentData = await parseNewVidPageArray(newVidPageArray);
  return vidPageContentData;
};

export const parseNewVidPageArray = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;
  const { vidPages } = CONFIG;

  const newVidPageArray = [];
  for (const vidPage of inputArray) {
    const { url, date } = vidPage;
    try {
      const vidPageContent = await parseVidPageContent(url, date);
      if (!vidPageContent) continue;
      console.log("VID PAGE CONTENT");
      console.log(vidPageContent);

      newVidPageArray.push(vidPageContent);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }
  return newVidPageArray;
};

export const parseVidPageContent = async (url, date) => {
  if (!url) return null;
  const { vidPages } = CONFIG;

  try {
    const kcna = new NORK({ url });
    const html = await kcna.getHTML();

    if (!html) {
      const error = new Error("FAILED TO GET VID PAGE ITEM HTML ");
      error.url = url;
      error.function = "parseVidPageContent";
      throw error;
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const vidPageTitle = await extractVidPageTitle(document);
    const vidURL = await extractVidURL(document, date);

    const storeParams = {
      title: vidPageTitle,
      vidURL: vidURL,
    };

    const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: storeParams }, vidPages);
    const storeData = await storeModel.updateObjItem();
    console.log("STORE DATA");
    console.log(storeData);

    return storeParams;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const extractVidPageTitle = async (document) => {
  const titleElement = document.querySelector(".title .main span");
  if (titleElement) {
    return titleElement.textContent.trim();
  }
  return null;
};

export const extractVidURL = async (document, date) => {
  const { vids } = CONFIG;
  if (!document) return null;

  const scriptArray = document.querySelectorAll("script");

  if (!scriptArray || !scriptArray.length) {
    const error = new Error("CANT EXTRACT SCRIPTS FOR VID URL");
    error.url = url;
    error.function = "extractVidURL";
    throw error;
  }

  const vidLink = await parseVidScripts(scriptArray);
  if (!vidLink) {
    const error = new Error("CANT VID URL FROM SCRIPTS");
    error.url = url;
    error.function = "extractVidURL";
    throw error;
  }

  try {
    //store url to vidDB (so dont have to do again); build params
    const vidURL = "http://www.kcna.kp" + vidLink;
    const vidId = await getIdFromURL(vidURL);
    const storeParams = {
      vidId: vidId,
      url: vidURL,
      scrapeId: kcnaState.scrapeId,
      date: date,
    };

    const storeVidModel = new dbModel(storeParams, vids);
    const storeData = await storeVidModel.storeUniqueURL();
    console.log("STORE DATA");
    console.log(storeData);

    return vidURL;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
  }
};

export const parseVidScripts = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  for (const script of inputArray) {
    const content = script.textContent;
    if (content && content.includes("type='video/mp4'")) {
      //regex looking for the vid type mp4
      const match = content.match(/source src='([^']+)' type='video\/mp4'/);
      if (match && match[1]) return match[1];
    }
  }

  return null;
};
