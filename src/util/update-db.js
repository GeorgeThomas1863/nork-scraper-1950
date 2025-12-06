import CONFIG from "../../config/config.js";
import kcnaState from "./state.js";
import dbModel from "../../models/db-model.js";

export const updatePicDataKCNA = async () => {
  // console.log("UPDATING PIC DATA");
  if (!kcnaState.scrapeActive) return null;

  const updateArray = [];
  const updateArticleData = await updateArticlePics();
  const updatePicSetData = await updatePicSetPics();
  //   const updateVidData = await updateVidPageThumbnail();
  //   updateArray.push(updateArticleData, updatePicSetData, updateVidData);
  updateArray.push(updateArticleData, updatePicSetData);

  return updateArray;
};

export const updateArticlePics = async () => {
  const { articles } = CONFIG;

  const articleDataModel = new dbModel({ keyExists: "url", arrayKey: "picArray", keyEmpty: "picSize" }, articles);
  const articleDataArray = await articleDataModel.findEmptyItemsNested();
  if (!articleDataArray || !articleDataArray.length) return null;

  //update articles
  const updateArticleArray = [];
  for (const article of articleDataArray) {
    if (!kcnaState.scrapeActive) return updateArticleArray;

    const updateArticleData = await updateArticleItem(article);
    updateArticleArray.push(updateArticleData);
  }

  return updateArticleArray;
};

export const updateArticleItem = async (inputObj) => {
  if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return null;
  const { url, picArray } = inputObj;
  const { articles } = CONFIG;

  const rebuiltPicArray = await rebuildPicArray(picArray);
  if (!rebuiltPicArray || !rebuiltPicArray.length) return null;

  const updateParams = {
    docKey: "url",
    docValue: url,
    updateKey: "picArray",
    updateArray: rebuiltPicArray,
  };

  try {
    const updateArticleModel = new dbModel(updateParams, articles);
    await updateArticleModel.updateArrayNested();
  } catch (e) {
    console.log("MONGO ERROR FOR ARTICLE PIC UPDATE: " + url);
    console.log(e.message);
  }

  return updateParams;
};

//-----

//update pic sets
export const updatePicSetPics = async () => {
  const { picSets } = CONFIG;

  const picSetDataModel = new dbModel({ keyExists: "url", arrayKey: "picArray", keyEmpty: "picSize" }, picSets);
  const picSetDataArray = await picSetDataModel.findEmptyItemsNested();
  if (!picSetDataArray || !picSetDataArray.length) return null;

  const updatePicSetArray = [];
  for (const picSet of picSetDataArray) {
    if (!kcnaState.scrapeActive) return updatePicSetArray;

    const updatePicSetData = await updatePicSetItem(picSet);
    if (!updatePicSetData) continue;
    updatePicSetArray.push(updatePicSetData);
  }

  return updatePicSetArray;
};

export const updatePicSetItem = async (inputObj) => {
  if (!inputObj || !inputObj.picArray || !inputObj.picArray.length) return null;
  const { url, picArray } = inputObj;
  const { picSets } = CONFIG;

  const rebuiltPicArray = await rebuildPicArray(picArray);
  if (!rebuiltPicArray || !rebuiltPicArray.length) return null;

  const updateParams = {
    docKey: "url",
    docValue: url,
    updateKey: "picArray",
    updateArray: rebuiltPicArray,
  };

  try {
    const updatePicSetModel = new dbModel(updateParams, picSets);
    const storeData = await updatePicSetModel.updateArrayNested();
    console.log("UPDATE PIC SET STORE DATA");
    console.log(storeData);
  } catch (e) {
    console.log("MONGO ERROR FOR PIC SET PIC UPDATE: " + url);
    console.log(e.message);
  }

  return updateParams;
};

//------

export const rebuildPicArray = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const rebuiltPicArray = [];
  for (const url of inputArray) {
    if (!kcnaState.scrapeActive) return rebuiltPicArray;

    const picData = await getPicData(url);
    if (!picData) continue;

    rebuiltPicArray.push(picData);
  }

  return rebuiltPicArray;
};

export const getPicData = async (url) => {
  if (!url) return null;
  const { pics } = CONFIG;

  try {
    const lookupPicModel = new dbModel({ keyToLookup: "url", itemValue: url }, pics);
    const picData = await lookupPicModel.getUniqueItem();

    return picData;
  } catch (e) {
    console.log("MONGO ERROR FOR UPDATE DB GET PIC DATA: " + url);
    console.log(e.message);
    return null;
  }
};
