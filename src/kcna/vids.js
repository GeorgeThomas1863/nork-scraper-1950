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

  // const newPicSetModel = new dbModel({ keyExists: "url", keyEmpty: "picArray" }, picSets);
  // const newPicSetArray = await newPicSetModel.findEmptyItems();

  // const picSetContentArray = await scrapePicSetContent(newPicSetArray);
  // console.log("PIC SET CONTENT ARRAY");
  // console.log(picSetContentArray);

  // return picSetContentArray;
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
