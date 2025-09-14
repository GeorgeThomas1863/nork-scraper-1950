import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import NORK from "../../models/nork-model.js";
import dbModel from "../../models/db-model.js";
import { kcnaState } from "./kcna-state.js";
import { extractItemDate } from "./util.js";

export const scrapePicsKCNA = async () => {
  const { picSets } = CONFIG;

  const picSetURLs = await scrapePicSetURLs();
  console.log("NEW PIC SET URLS");
  console.log(picSetURLs);

  const newPicSetModel = new dbModel({ keyExists: "url", keyEmpty: "picArray" }, picSets);
  const newPicSetArray = await newPicSetModel.findEmptyItems();

  const picSetContentArray = await scrapePicSetContent(newPicSetArray);
  console.log("PIC SET CONTENT ARRAY");
  console.log(picSetContentArray);
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
    const titleWrapper = picSetElement.querySelector(".title a");
    const picSetLink = titleWrapper.getAttribute("href");
    const picSetDate = await extractItemDate(picSetElement);
    picSetArray.push({ picSetLink, picSetDate });
  }

  console.log("PIC SET ARRAY");
  console.log(picSetArray);

  //throw error if no links found
  if (!picSetArray || !picSetArray.length) {
    const error = new Error("CANT EXTRACT ARTICLES FROM ELEMENT");
    error.url = url;
    error.function = "parsePicSetList";
    throw error;
  }

  return picSetArray;
};

//------------------------------

export const scrapePicSetContent = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const picSetContentArray = [];
  for (const picSet of inputArray) {
    const { url } = picSet;
    try {
      const picSetContent = await parsePicSetContent(url);
      if (!picSetContent) continue;
      console.log("PIC SET CONTENT");
      console.log(picSetContent);

      picSetContentArray.push(picSetContent);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }
  return picSetContentArray;
};

export const parsePicSetContent = async (url) => {
  if (!url) return null;
  const { picSets } = CONFIG;

  // console.log("CONTENT URL");
  // console.log(url);

  const kcna = new NORK({ url });
  const html = await kcna.getHTML();

  if (!html) {
    const error = new Error("FAILED TO GET ARTICLE ITEM HTML ");
    error.url = url;
    error.function = "parseArticleContent";
    throw error;
  }

  console.log("PIC SETHTML");
  console.log(html);

  //   const dom = new JSDOM(html);
  //   const document = dom.window.document;

  //   const articleTitle = await extractArticleTitle(document);
  //   const articleText = await extractArticleText(document);
  //   const articlePicPage = await extractArticlePicPage(document);
  //   const articlePicArray = await extractArticlePicArray(articlePicPage);

  //   const storeParams = {
  //     title: articleTitle,
  //     text: articleText,
  //     picPageURL: articlePicPage,
  //   };

  //   if (articlePicArray) {
  //     storeParams.picArray = articlePicArray;
  //   }

  //   const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: storeParams }, articles);
  //   const storeData = await storeModel.updateObjItem();
  //   console.log("STORE DATA");
  //   console.log(storeData);

  //   return storeParams;
  // };

  // export const extractArticleTitle = async (document) => {
  //   const titleElement = document.querySelector(".article-main-title");
  //   const articleTitle = titleElement?.textContent?.replace(/\s+/g, " ").trim();
  //   return articleTitle;
  // };

  // export const extractArticleText = async (document) => {
  //   //extract text content
  //   const textElement = document.querySelector(".content-wrapper");
  //   const textArray = textElement.querySelectorAll("p"); //array of paragraph elements

  //   const paragraphArray = [];
  //   for (let i = 0; i < textArray.length; i++) {
  //     paragraphArray.push(textArray[i].textContent.trim());
  //   }

  //   // Join paragraphs with double newlines for better readability
  //   const articleText = paragraphArray.join("\n\n");
  //   return articleText;
  // };

  // export const extractArticlePicPage = async (document) => {
  //   //get article PAGE (if exists) where all pics are displayed
  //   const mediaIconElement = document.querySelector(".media-icon");
  //   const picPageHref = mediaIconElement?.firstElementChild?.getAttribute("href");

  //   //return null if  pic doesnt exist
  //   if (!picPageHref) return null;

  //   //otherwise build pic / pic array
  //   const picPageURL = "http://www.kcna.kp" + picPageHref;
  //   return picPageURL;
  // };

  // export const extractArticlePicArray = async (url) => {
  //   const { pics } = CONFIG;
  //   const { scrapeId } = kcnaState;
  //   if (!url) return null;

  //   try {
  //     const kcna = new NORK({ url });
  //     const html = await kcna.getHTML();

  //     if (!html) {
  //       const error = new Error("FAILED TO GET ARTICLE PIC ARRAY HTML ");
  //       error.url = url;
  //       error.function = "extractArticlePicArray";
  //       throw error;
  //     }

  //     const dom = new JSDOM(html);
  //     const document = dom.window.document;

  //     //get and loop through img elements
  //     const picArray = [];
  //     const imgArray = document.querySelectorAll("img");
  //     for (let i = 0; i < imgArray.length; i++) {
  //       try {
  //         const imgSrc = imgArray[i].getAttribute("src");
  //         if (!imgSrc) continue;

  //         const articlePicURL = "http://www.kcna.kp" + imgSrc;

  //         picArray.push(articlePicURL);

  //         const picDate = await lookupItemDate(url, "articles");

  //         //store url to picDB (so dont have to do again); build params
  //         const storeParams = {
  //           url: articlePicURL,
  //           scrapeId: scrapeId,
  //           date: picDate,
  //         };

  //         const storePicModel = new dbModel(storeParams, pics);
  //         await storePicModel.storeUniqueURL();
  //       } catch (e) {
  //         console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
  //       }
  //     }

  //     return picArray;
  //   } catch (e) {
  //     console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
  //     return null;
  //   }
};
