import { JSDOM } from "jsdom";

import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import { tgSendMessage } from "../../tg-api.js";
// import kcnaState from "../../util/state.js";
import { postPicArrayTG } from "../pics/pics-upload.js";
import { normalizeTGInputs, sortArrayByDate } from "../util/util.js";

export const uploadArticlesKCNA = async () => {
  const { articles, tgChannelId } = CONFIG;
  const articleModel = new dbModel({ keyExists: "url", keyEmpty: "tgChannelId" }, articles);
  const articleArray = await articleModel.findEmptyItems();
  if (!articleArray || !articleArray.length) return null;

  const articleArraySorted = await sortArrayByDate(articleArray);

  const articlePostDataArray = [];
  for (const article of articleArraySorted) {
    try {
      const { url } = article;

      //add channelId HERE
      article.tgChannelId = tgChannelId;

      //post article
      const articlePostData = await postArticleTG(article);
      if (!articlePostData) continue;
      articlePostDataArray.push(articlePostData);

      console.log("ARTICLE POST DATA");
      console.log(articlePostData);

      //store data
      const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: articlePostData }, articles);
      const storeData = await storeModel.updateObjItem();
      console.log("STORE DATA");
      console.log(storeData);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  return articlePostDataArray;
};

export const postArticleTG = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date, picArray } = inputObj;

  //normalize url and date
  const tgInputs = await normalizeTGInputs(url, date);
  const uploadObj = { ...inputObj, ...tgInputs };

  const titleData = await postArticleTitleTG(uploadObj);
  console.log("TITLE DATA");
  console.log(titleData);

  //post pics if exist
  if (picArray && picArray.length) {
    const articlePicsData = await postArticlePicsTG(uploadObj);
    console.log("ARTICLE PICS DATA");
    console.log(articlePicsData);
  }

  const articleContentData = await postArticleContentTG(uploadObj);
  console.log("ARTICLE CONTENT DATA");
  console.log(articleContentData);

  return uploadObj;
};

export const postArticleTitleTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId } = inputObj;

  const titleText = await buildArticleTitleText(inputObj);

  const params = {
    chat_id: tgChannelId,
    text: titleText,
    parse_mode: "HTML",
  };

  const data = await tgSendMessage(params);
  return data;
};

export const buildArticleTitleText = async (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, articleType, articleId, urlNormal } = inputObj;

  const titleText = `🇰🇵 🇰🇵 🇰🇵
  
-----------------
    
<b>ARTICLE TITLED: ${title}</b>
  
-----------------
  
<b>ARTICLE TYPE:</b> ${articleType} | <b>ID:</b> ${articleId} | <b>DATE:</b> <i>${dateNormal}</i> | <b>URL:</b> 
<i>${urlNormal}</i>
  `;

  return titleText;
};

export const postArticlePicsTG = async (inputObj) => {
  if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return null;
  const { picArray } = inputObj;

  //add caption to each pic
  const picArrayWithCaption = [];
  for (let i = 0; i < picArray.length; i++) {
    const picObj = picArray[i];
    picObj.picIndex = i + 1;
    picObj.picCount = picArray.length;
    const articlePicCaption = await buildArticlePicCaption(picObj);
    if (!articlePicCaption) continue;

    picObj.caption = articlePicCaption;
    picArrayWithCaption.push(picObj);
  }

  const data = await postPicArrayTG(picArrayWithCaption);
  return data;
};

export const buildArticlePicCaption = async (inputObj) => {
  if (!inputObj) return null;
  const { picIndex, picCount, date, url } = inputObj;

  //run again bc nested
  const normalInputs = await normalizeTGInputs(url, date);
  const { dateNormal, urlNormal } = normalInputs;

  const articlePicCaption = `
<b>ARTICLE PIC: ${picIndex} OF ${picCount}</b> | <b>DATE:</b> <i>${dateNormal}</i> | <b>PIC URL:</b>
<i>${urlNormal}</i>
`;

  return articlePicCaption;
};

export const postArticleContentTG = async (inputObj) => {
  if (!inputObj || !inputObj.text) return null;
  const { text, title, dateNormal, urlNormal, tgChannelId } = inputObj;
  const { tgMaxLength } = CONFIG;

  const maxLength = tgMaxLength - title.length - dateNormal.length - urlNormal.length - 100;
  const chunkTotal = Math.ceil(text.length / maxLength);

  const chunkObj = { ...inputObj, chunkTotal };
  const chunkArray = [];
  for (let i = 0; i < chunkTotal; i++) {
    const chunk = text.substring(i * maxLength, (i + 1) * maxLength);
    const chunkText = await buildChunkText(chunk, chunkObj, i);
    if (!chunkText) continue;

    const params = {
      chat_id: tgChannelId,
      text: chunkText,
      parse_mode: "HTML",
    };

    const data = await tgSendMessage(params);
    if (!data) continue;
    chunkObj.chunkData = data;

    chunkArray.push(chunkObj);
  }
  return chunkArray;
};

export const buildChunkText = async (chunk, inputObj, chunkIndex) => {
  if (!inputObj) return null;
  const { urlNormal, chunkTotal } = inputObj;

  switch (chunkIndex) {
    case 0:
      return "<b>[ARTICLE TEXT]:</b>" + "\n\n" + chunk;

    case chunkTotal - 1:
      return chunk + "\n\n" + "<b>URL:</b> <i>" + urlNormal + "</i>";

    default:
      return chunk;
  }
};
