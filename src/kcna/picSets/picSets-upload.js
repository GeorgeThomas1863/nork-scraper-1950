import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import { normalizeTGInputs } from "../util/util.js";

export const uploadPicSetsKCNA = async () => {
  const { picSets, tgChannelId } = CONFIG;
  const picSetModel = new dbModel({ keyExists: "url", keyEmpty: "tgChannelId" }, picSets);
  const picSetArray = await picSetModel.findEmptyItems();
  if (!picSetArray || !picSetArray.length) return null;

  const picSetPostDataArray = [];
  for (const picSet of picSetArray) {
    try {
      const { url } = picSet;

      //add channelId HERE
      picSet.tgChannelId = tgChannelId;

      //post article
      const picSetPostData = await postPicSetTG(picSet);
      if (!picSetPostData) continue;
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

  return picSetPostDataArray;
};

export const postPicSetTG = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date, picArray } = inputObj;

  //normalize url and date
  const tgInputs = await normalizeTGInputs(url, date);
  const uploadObj = { ...inputObj, ...tgInputs };

  const titleData = await postPicSetTitleTG(uploadObj);
  console.log("TITLE DATA");
  console.log(titleData);

  //post pics if exist

  const picSetPicData = await postPicSetPicsTG(uploadObj);
  console.log("PIC SET PICS DATA");
  console.log(picSetPicData);

  // const articleContentData = await postArticleContentTG(uploadObj);
  // console.log("ARTICLE CONTENT DATA");
  // console.log(articleContentData);

  return uploadObj;
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

  const data = await tgSendMessage(params);
  return data;
};

//FIX
export const buildPicSetTitleText = async (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, articleId, picArray } = inputObj;

  const picCount = picArray.length;

  const titleText = `🇰🇵 🇰🇵 🇰🇵
  
-----------------
    
<b>${title}</b>
  
-----------------
  
<b>${picCount} ITEM PIC SET</b> | <b>ID:</b> ${articleId} | <b>DATE:</b> <i>${dateNormal}</i>
  `;

  return titleText;
};
