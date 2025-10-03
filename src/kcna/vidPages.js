import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { kcnaState } from "./kcna-control.js";
import { extractItemDate, lookupItemDate } from "./util.js";

export const scrapeVidPagesKCNA = async () => {
  const { vidPages } = CONFIG;

  const vidPageURLs = await scrapeVidPageURLs();
  console.log("NEW VID PAGE URLS");
  console.log(vidPageURLs);

  const newVidPageModel = new dbModel({ keyExists: "url", keyEmpty: "vidURL" }, vidPages);
  const newVidPageArray = await newVidPageModel.findEmptyItems();

  const vidPageContentArray = await scrapeVidPageContent(newVidPageArray);
  console.log("VID PAGE CONTENT ARRAY");
  console.log(vidPageContentArray);

  return vidPageContentArray;
};

export const scrapeVidPageURLs = async () => {
  const { vidListURL, vidPages } = CONFIG;

  try {
    const vidPageListArray = await parseVidPageList(vidListURL);

    const vidPageURLArray = [];
    for (const vidPage of vidPageListArray) {
      const { vidPageLink, vidPageDate, thumbnailURL } = vidPage;
      const vidPageURL = "http://www.kcna.kp" + vidPageLink;
      const params = {
        url: vidPageURL,
        date: vidPageDate,
        thumbnailURL: thumbnailURL,
        scrapeId: kcnaState.scrapeId,
      };

      console.log("PARAMS");
      console.log(params);

      const storeModel = new dbModel(params, vidPages);
      const storeData = await storeModel.storeUniqueURL();
      console.log("STORE DATA");
      console.log(storeData);

      vidPageURLArray.push(params);
    }

    return vidPageURLArray;
  } catch (e) {
    console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    return null;
  }
};

export const parseVidPageList = async (url) => {
  if (!url) return null;

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();

  if (!html) {
    const error = new Error("FAILED TO GET VID PAGE LIST HTML ");
    error.url = url;
    error.function = "parseVidPageList";
    throw error;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const vidWrapperArray = document.querySelectorAll(".video-wrapper");

  //throw error if no pic Pages found
  if (!vidWrapperArray || !vidWrapperArray.length) {
    const error = new Error("CANT EXTRACT VID PAGE LIST");
    error.url = url;
    error.function = "parseVidPageList";
    throw error;
  }

  const vidPageArray = [];
  for (const vidPageElement of vidWrapperArray) {
    const vidLinkElement = vidPageElement.querySelector(".img a");
    const vidPageLink = vidLinkElement.getAttribute("href");
    const vidPageDate = await extractItemDate(vidPageElement);
    //thumbnail only on list page
    const thumbnailURL = await extractVidThumbnail(vidPageElement, vidPageDate);
    vidPageArray.push({ vidPageLink, vidPageDate, thumbnailURL });
  }

  console.log("VID PAGE ARRAY");
  console.log(vidPageArray);

  //throw error if no links found
  if (!vidPageArray || !vidPageArray.length) {
    const error = new Error("CANT EXTRACT VID PAGE FROM ELEMENT");
    error.url = url;
    error.function = "parseVidPageList";
    throw error;
  }

  return vidPageArray;
};

export const extractVidThumbnail = async (inputElement, date) => {
  const { pics } = CONFIG;
  if (!inputElement) return null;

  // console.log("VID THUMNAIL DOCUMENT");
  // console.log(document);

  //get thumbnailURL
  const thumbnailElement = inputElement.querySelector(".img img");
  const thumbnailLink = thumbnailElement.getAttribute("src");
  const thumbnailURL = "http://www.kcna.kp" + thumbnailLink;

  if (!thumbnailURL) {
    const error = new Error("CANT EXTRACT VID THUMBNAIL");
    error.url = url;
    error.function = "extractVidThumbnail";
    throw error;
  }

  //store thumbnail to picsDB
  try {
    const storeParams = {
      url: thumbnailURL,
      scrapeId: kcnaState.scrapeId,
      date: date,
    };

    console.log("!!!!!!!!!!!!!");
    console.log("STORE PARAMS");
    console.log(storeParams);

    const picModel = new dbModel(storeParams, pics);
    const storeData = await picModel.storeUniqueURL();
    console.log(storeData);
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
  }

  return thumbnailURL;
};

//------------------------------

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
    const storeParams = {
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
