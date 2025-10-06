import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../state.js";
import { extractItemDate, lookupItemDate, getIdFromURL } from "../util.js";

export const scrapeVidPageContent = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const vidPageContentArray = [];
  for (const vidPage of inputArray) {
    const { url } = vidPage;
    try {
      const vidPageContent = await parseVidPageContent(url);
      if (!vidPageContent) continue;
      console.log("VID PAGE CONTENT");
      console.log(vidPageContent);

      vidPageContentArray.push(vidPageContent);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }
  return vidPageContentArray;
};

export const parseVidPageContent = async (url) => {
  if (!url) return null;
  const { vidPages } = CONFIG;

  try {
    const kcna = new NORK({ url });
    const html = await kcna.getHTML();

    // console.log("VID PAGE HTML");
    // console.log(html);

    if (!html) {
      const error = new Error("FAILED TO GET VID PAGE ITEM HTML ");
      error.url = url;
      error.function = "parseVidPageContent";
      throw error;
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    const vidPageTitle = await extractVidPageTitle(document);
    const vidURL = await extractVidURL(document, url);

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

export const extractVidURL = async (document, url) => {
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

  const vidURL = "http://www.kcna.kp" + vidLink;
  const vidDate = await lookupItemDate(url, "vidPages");

  try {
    //store url to vidDB (so dont have to do again); build params
    const vidId = await getIdFromURL(vidURL);
    const storeParams = {
      vidId: vidId,
      url: vidURL,
      scrapeId: kcnaState.scrapeId,
      date: vidDate,
    };

    const storeVidModel = new dbModel(storeParams, vids);
    const storeData = await storeVidModel.storeUniqueURL();
    console.log(storeData);
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
  }

  return vidURL;
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
