import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import { tgPostPicFS } from "../../tg-api.js";
import { normalizeTGInputs } from "../util/util.js";
import { chunkVidFS } from "../vids/vids-chunk.js";

import { exec } from "child_process";
import { promisify } from "util";
import { access, mkdir, readdir, unlink } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export const uploadVidPagesKCNA = async () => {
  const { vidPages, tgChannelId } = CONFIG;
  const vidPageModel = new dbModel({ keyExists: "url", keyEmpty: "tgChannelId" }, vidPages);
  const vidPageArray = await vidPageModel.findEmptyItems();
  if (!vidPageArray || !vidPageArray.length) return null;

  const vidPagePostDataArray = [];
  for (const vidPage of vidPageArray) {
    try {
      const { url } = vidPage;

      //add channelId HERE
      vidPage.tgChannelId = tgChannelId;

      //post article
      const vidPagePostData = await postVidPageTG(vidPage);
      if (!vidPagePostData) continue;
      vidPagePostDataArray.push(vidPagePostData);

      console.log("VID PAGE POST DATA");
      console.log(vidPagePostData);

      //store data
      const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: vidPagePostData }, vidPages);
      const storeData = await storeModel.updateObjItem();
      console.log("STORE DATA");
      console.log(storeData);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  return vidPagePostDataArray;
};

export const postVidPageTG = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date } = inputObj;
  const { tgChannelId } = CONFIG;

  //normalize url and date
  const tgInputs = await normalizeTGInputs(url, date);
  const uploadObj = { ...inputObj, ...tgInputs };

  //add channelId HERE
  uploadObj.tgChannelId = tgChannelId;

  console.log("UPLOAD OBJ");
  console.log(uploadObj);

  const chunkVidArray = await chunkVidFS(uploadObj);
  console.log("CHUNK VID ARRAY");
  console.log(chunkVidArray);

  // post thumbnail as title
  const thumbnailData = await postThumbnailTG(uploadObj);
  console.log("THUMBNAIL DATA");
  console.log(thumbnailData);

  // const vidPostData = await postVidTG(uploadObj);
  // console.log("VID POST DATA");
  // console.log(vidPostData);

  return uploadObj;
};

//HERE

export const postThumbnailTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId, thumbnailData } = inputObj;

  const thumbnailCaption = await buildThumbnailCaption(inputObj);

  const params = {
    chatId: tgChannelId,
    savePath: thumbnailData.savePath,
    caption: thumbnailCaption,
    mode: "html",
  };

  const data = await tgPostPicFS(params);
  return data;
};

export const buildThumbnailCaption = async (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, thumbnailData } = inputObj;

  const captionText = `🇰🇵 🇰🇵 🇰🇵

-----------------
      
<b>${title}</b>
    
-----------------

<b>THUMBNAIL ID:</b> ${thumbnailData.picId} | <b>DATE:</b> <i>${dateNormal}</i> | <b>THUMBNAIL URL:</b> 
<i>${thumbnailData.url}</i>
    `;

  return captionText;
};

// export const postVidTG = async (inputObj) => {};

// //FIX
// export const buildPicSetTitleText = async (inputObj) => {
//   if (!inputObj) return null;
//   const { title, dateNormal, picSetId, picArray, urlNormal } = inputObj;

//   const picCount = picArray.length;

//   const titleText = `🇰🇵 🇰🇵 🇰🇵

// -----------------

// <b>${title}</b>

// -----------------

// <b>${picCount} ITEM PIC SET</b> | <b>ID:</b> ${picSetId} | <b>DATE:</b> <i>${dateNormal}</i>
// <b>URL:</b> <i>${urlNormal}</i>
//   `;

//   return titleText;
// };

// export const postPicSetPicsTG = async (inputObj) => {
//   if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return null;
//   const { picArray } = inputObj;

//   //add caption to each pic
//   const picArrayWithCaption = [];
//   for (let i = 0; i < picArray.length; i++) {
//     const picObj = picArray[i];
//     picObj.picIndex = i + 1;
//     picObj.picCount = picArray.length;
//     const picSetPicCaption = await buildPicSetPicCaption(picObj);
//     if (!picSetPicCaption) continue;

//     picObj.caption = picSetPicCaption;
//     picArrayWithCaption.push(picObj);
//   }

//   const data = await postPicArrayTG(picArrayWithCaption);
//   return data;
// };

// export const buildPicSetPicCaption = async (inputObj) => {
//   if (!inputObj) return null;
//   const { picIndex, picCount, date, url } = inputObj;

//   //run again bc nested
//   const normalInputs = await normalizeTGInputs(url, date);
//   const { dateNormal, urlNormal } = normalInputs;

//   const picSetPicCaption = `
// <b>ARTICLE PIC: ${picIndex} OF ${picCount}</b> | <b>DATE:</b> <i>${dateNormal}</i>
// <b>PIC URL:</b> <i>${urlNormal}</i>
// `;

//   return picSetPicCaption;
// };
