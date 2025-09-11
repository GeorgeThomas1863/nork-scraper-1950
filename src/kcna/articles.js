import { JSDOM } from "jsdom";

import CONFIG from "../../config/config.js";
import KCNA from "../../models/kcna.js";

//get article urls
export const scrapeArticlesKCNA = async () => {
  const { articleTypeUrlArr } = CONFIG;

  console.log("ARTICLE TYPE URL ARRAY");
  console.log(articleTypeUrlArr);

  for (const type of articleTypeUrlArr) {
    try {
      const typeURL = CONFIG[type];
      // console.log("TYPE URL");
      // console.log(typeURL);
      const kcna = new KCNA({ url: typeURL });
      //list html
      const html = await kcna.getHTML();
      const articleArray = await extractArticleList(html, type);

      //   console.log("ARTICLE ARRAY");
      //   console.log(articleArray);

      for (const a of articleArray) {
        const articleURL = "http://www.kcna.kp" + a;
        console.log("ARTICLE URL");
        console.log(articleURL);
      }
    } catch (e) {
      console.log(e.message + "; URL: " + e.url + "; ARTICLE TYPE: " + e.articleType + "; F BREAK: " + e.function);
    }
  }
};

export const extractArticleList = async (html, type) => {
  if (!html) {
    const error = new Error("FAILED TO GET ARTICLE LIST HTML ");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "extractArticleList";
    throw error;
  }

  const dom = new JSDOM(html);
  const document = dom.window.document;

  const articleLinkElement = document.querySelector(".article-link");
  const linkElementArray = articleLinkElement?.querySelectorAll("a");

  //throw error if no links found
  if (!linkElementArray || !linkElementArray.length) {
    const error = new Error("CANT EXTRACT ARTICLE LIST");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "extractArticleList";
    throw error;
  }

  const articleArray = [];
  for (const linkElement of linkElementArray) {
    const articleLink = linkElement.getAttribute("href");
    articleArray.push(articleLink);
  }

  //throw error if no links found
  if (!articleArray || !articleArray.length) {
    const error = new Error("CANT EXTRACT ARTICLES FROM ELEMENT");
    error.url = CONFIG[type];
    error.articleType = type;
    error.function = "extractArticleList";
    throw error;
  }

  return articleArray;
};

// export const extractArticleLinkArray = async (inputArray) => {

//     const articleLinkArray = [];
//     for (const linkElement of linkElementArray) {
//         const articleLink = linkElement.getAttribute("href");
//         articleLinkArray.push(articleLink);
//     }
//     return articleLinkArray;
// }

// // Find article-link (wrapper element) extract out all links

// const articleLinkObj = {
//   type: type,
//   inputArray: linkElementArray,
// };

// //extract out the articleListObjs
// const articleLinkModel = new Article(articleLinkObj);
// const articleListArray = await articleLinkModel.parseArticleLinks();

// return articleListArray;

// /**
// * Parses array of article link items (loops through), returns array of (unsorted) articleListObjs
// * @function parseLinkArray
// * @param {*} inputArray (array of article link items)
// * @returns //array of (unsorted) articleListObjs
// */
// async parseArticleLinks() {
// const { inputArray, type } = this.dataObject;

// //loop through a tags and pull out hrefs
// const articleListArray = [];
// for (let i = 0; i < inputArray.length; i++) {
//   try {
//     const articleListModel = new Article({ listItem: inputArray[i] });
//     const articleListObj = await articleListModel.parseArticleListItem();

//     //ADD ARTICLE TYPE HERE AND SCRAPE ID HERE
//     articleListObj.articleType = type;
//     articleListObj.scrapeId = scrapeState.scrapeId;

//     articleListArray.push(articleListObj); //add to array
//   } catch (e) {
//     console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
//   }
// }

// return articleListArray;
// }

// /**
// * Parses individual article link item, builds / returns single articleListObj
// * @function parseArticleListItem
// * @param {*} listItem article link item
// * @returns articleListObj (with url / date extracted)
// */
// async parseArticleListItem() {
// const { listItem } = this.dataObject;
// if (!listItem) return null;

// //get article link
// const href = listItem.getAttribute("href");

// //throw error if cant extact pic link
// if (!href) {
//   const error = new Error("CANT FIND ARTICLE LINK [ARTICLE MODEL]");
//   error.url = listItem.textContent;
//   error.function = "parsePicSetListItem";
//   throw error;
// }

// //build full url
// const urlConstant = "http://www.kcna.kp";
// const url = urlConstant + href;

// //CHECK IF URL NEW HERE, throws error if not new
// const checkModel = new dbModel({ url: url }, CONFIG.articleList);
// await checkModel.urlNewCheck();

// //GET DATE
// const dateModel = new UTIL({ inputItem: listItem });
// const articleDate = await dateModel.parseListDate();

// //build obj
// const articleListObj = {
//   url: url,
//   date: articleDate,
// };

// return articleListObj;
// }
