import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { kcnaState } from "./state.js";
import { extractItemDate, lookupItemDate } from "./util.js";

export const scrapeVidsKCNA = async () => {
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
      const { vidPageLink, vidPageDate } = vidPage;
      const vidPageURL = "http://www.kcna.kp" + vidPageLink;
      const params = {
        url: vidPageURL,
        date: vidPageDate,
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
    vidPageArray.push({ vidPageLink, vidPageDate });
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

  console.log("CONTENT URL");
  console.log(url);

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();

  console.log("VID PAGE HTML");
  console.log(html);

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
  const thumbnailURL = await extractVidThumbnail(document, url);

  const storeParams = {
    title: vidPageTitle,
    vidURL: vidURL,
    thumbnailURL: thumbnailURL,
  };

  const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: storeParams }, vidPages);
  const storeData = await storeModel.updateObjItem();
  console.log("STORE DATA");
  console.log(storeData);

  return storeParams;
};

export const extractVidPageTitle = async (document) => {
  const titleElement = document.querySelector(".title .main span");
  if (titleElement) {
    return titleElement.textContent.trim();
  }
  return null;
};

export const extractVidURL = async (document, url) => {
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
      const storeParams = {
        url: picSetPicURL,
        scrapeId: kcnaState.scrapeId,
        date: picDate,
      };

      const storePicModel = new dbModel(storeParams, pics);
      await storePicModel.storeUniqueURL();
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  return picSetPicArray;
};

export const extractVidThumbnail = async (document, url) => {};
