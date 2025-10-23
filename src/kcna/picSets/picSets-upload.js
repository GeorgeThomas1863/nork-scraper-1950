import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../util/state.js";

import { tgSendMessage } from "../../tg/tg-api.js";
import { postPicArrayTG } from "../pics/pics-upload.js";
import { normalizeTGInputs, sortArrayByDate } from "../util/util.js";
import { updateDisplayerKCNA } from "../util/api.js";

export const uploadPicSetsKCNA = async () => {
  const { picSets, tgChannelId } = CONFIG;
  if (!kcnaState.scrapeActive) return null;

  const picSetModel = new dbModel({ keyExists: "url", keyEmpty: "tgChannelId" }, picSets);
  const picSetArray = await picSetModel.findEmptyItems();
  if (!picSetArray || !picSetArray.length) return null;

  const picSetArraySorted = await sortArrayByDate(picSetArray, "picSets");

  const picSetPostDataArray = [];
  for (const picSet of picSetArraySorted) {
    if (!kcnaState.scrapeActive) return picSetPostDataArray;

    try {
      const { url } = picSet;

      //add channelId HERE
      picSet.tgChannelId = tgChannelId;

      //post article
      const picSetPostData = await postPicSetTG(picSet);
      if (!picSetPostData) continue;
      kcnaState.scrapeObj.picSetUpload++;
      picSetPostDataArray.push(picSetPostData);

      console.log("PIC SET POST DATA");
      console.log(picSetPostData);

      //store data
      const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: picSetPostData }, picSets);
      const storeData = await storeModel.updateObjItem();
      console.log("STORE DATA");
      console.log(storeData);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  kcnaState.scrapeStep = "VID PAGE UPLOAD KCNA";
  kcnaState.scrapeMessage = `FINISHED UPLOADING ${picSetPostDataArray.length} NEW PIC SETS TO TG`;
  await updateDisplayerKCNA(kcnaState);

  return picSetPostDataArray;
};

export const postPicSetTG = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date } = inputObj;

  //normalize url and date
  const tgInputs = await normalizeTGInputs(url, date);
  const uploadObj = { ...inputObj, ...tgInputs };

  try {
    const titleData = await postPicSetTitleTG(uploadObj);
    console.log("TITLE DATA");
    console.log(titleData);

    //post pics if exist

    const picSetPicData = await postPicSetPicsTG(uploadObj);
    console.log("PIC SET PICS DATA");
    console.log(picSetPicData);

    return uploadObj;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const postPicSetTitleTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId } = inputObj;

  const titleText = await buildPicSetTitleText(inputObj);

  const params = {
    chat_id: tgChannelId,
    text: titleText,
    parse_mode: "HTML",
  };

  try {
    const data = await tgSendMessage(params);
    return data;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

//FIX
export const buildPicSetTitleText = async (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, picSetId, picArray, urlNormal } = inputObj;

  const picCount = picArray.length;

  const titleText = `🇰🇵 🇰🇵 🇰🇵
  
-----------------
    
<b>PIC SET TITLED: ${title}</b>
  
-----------------

<b>${picCount} ITEM PIC SET</b> | <b>ID:</b> ${picSetId} | <b>DATE:</b> <i>${dateNormal}</i> | <b>PIC URL:</b> 
<i>${urlNormal}</i>
  `;

  return titleText;
};

export const postPicSetPicsTG = async (inputObj) => {
  if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return null;
  const { picArray } = inputObj;

  //add caption to each pic
  const picArrayWithCaption = [];
  for (let i = 0; i < picArray.length; i++) {
    if (!kcnaState.scrapeActive) return picArrayWithCaption;

    const picObj = picArray[i];
    picObj.picIndex = i + 1;
    picObj.picCount = picArray.length;
    const picSetPicCaption = await buildPicSetPicCaption(picObj);
    if (!picSetPicCaption) continue;

    picObj.caption = picSetPicCaption;
    picArrayWithCaption.push(picObj);
  }
  try {
    const data = await postPicArrayTG(picArrayWithCaption);
    return data;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const buildPicSetPicCaption = async (inputObj) => {
  if (!inputObj) return null;
  const { picIndex, picCount, date, url } = inputObj;

  //run again bc nested
  const normalInputs = await normalizeTGInputs(url, date);
  const { dateNormal, urlNormal } = normalInputs;

  const picSetPicCaption = `
<b>PIC ${picIndex} OF ${picCount} PIC SET</b> | <b>DATE:</b> <i>${dateNormal}</i> | <b>PIC URL:</b> 
<i>${urlNormal}</i>
`;

  return picSetPicCaption;
};
