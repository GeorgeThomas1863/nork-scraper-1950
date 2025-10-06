import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../../models/nork-model.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../state.js";
import { extractItemDate, lookupItemDate, getIdFromURL } from "../util.js";

export const scrapeVidPageURLsKCNA = async () => {
  const { vidPageListURL } = CONFIG;

  const vidPageURLData = [];
  try {
    const vidPageListData = await parseVidPageList(vidPageListURL);
    if (!vidPageListData) return null;
    vidPageURLData.push(vidPageListData);
  } catch (e) {
    console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    return null;
  }

  // const vidPageURLs = await scrapeVidPageURLs();
  // console.log("NEW VID PAGE URLS");
  // console.log(vidPageURLs);

  // const newVidPageModel = new dbModel({ keyExists: "url", keyEmpty: "vidURL" }, vidPages);
  // const newVidPageArray = await newVidPageModel.findEmptyItems();

  // const vidPageContentArray = await scrapeVidPageContent(newVidPageArray);
  // console.log("VID PAGE CONTENT ARRAY");
  // console.log(vidPageContentArray);

  // return vidPageContentArray;
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
  if (!vidWrapperArray || !vidWrapperArray.length) return null;

  const vidPageListArray = await extractVidPageListArray(vidWrapperArray);
  return vidPageListArray;
};

export const extractVidPageListArray = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const vidPageURLArray = [];
  for (const vidPageElement of inputArray) {
    const vidLinkElement = vidPageElement.querySelector(".img a");
    const vidPageLink = vidLinkElement.getAttribute("href");
    const vidPageDate = await extractItemDate(vidPageElement);
    //thumbnail only on list page
    const thumbnailURL = await extractVidThumbnail(vidPageElement, vidPageDate);

    const vidPageURL = "http://www.kcna.kp" + vidPageLink;
    const params = {
      url: vidPageURL,
      date: vidPageDate,
      thumbnailURL: thumbnailURL,
      scrapeId: kcnaState.scrapeId,
    };

    console.log("VID PAGE LIST PARAMS");
    console.log(params);

    const storeModel = new dbModel(params, vidPages);
    const storeData = await storeModel.storeUniqueURL();
    console.log("VID PAGE LIST STORE DATA");
    console.log(storeData);

    vidPageURLArray.push(params);
  }

  return vidPageURLArray;
};

export const extractVidThumbnail = async (inputElement, date) => {
  const { pics } = CONFIG;
  if (!inputElement) return null;

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
  const picId = await getIdFromURL(thumbnailURL);
  try {
    const storeParams = {
      picId: picId,
      url: thumbnailURL,
      scrapeId: kcnaState.scrapeId,
      date: date,
    };

    console.log("STORE PIC PARAMS");
    console.log(storeParams);

    const picModel = new dbModel(storeParams, pics);
    const storeData = await picModel.storeUniqueURL();
    console.log("STORE PIC DATA");
    console.log(storeData);
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
  }

  return thumbnailURL;
};
