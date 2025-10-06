import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

//UPDATE DB (with full pic data in each collection)
export const updatePicDataKCNA = async () => {
  console.log("UPDATING PIC DATA");

  const updateArray = [];
  const updateArticleData = await updateArticlePics();
  const updatePicSetData = await updatePicSetPics();
  const updateVidData = await updateVidPageThumbnail();
  updateArray.push(updateArticleData, updatePicSetData, updateVidData);

  return updateArray;
};

//----------

//update articles
export const updateArticlePics = async () => {
  const { articles } = CONFIG;

  const articleDataModel = new dbModel({ keyExists: "url", arrayKey: "picArray", keyEmpty: "picSize" }, articles);
  const articleDataArray = await articleDataModel.findEmptyItemsNested();
  if (!articleDataArray || !articleDataArray.length) return null;

  console.log("ARTICLES TO UPDATE");
  console.log(articleDataArray);

  //update articles
  const updateArticleArray = [];
  for (const article of articleDataArray) {
    try {
      const updateArticleData = await updateArticleItem(article);
      updateArticleArray.push(updateArticleData);
    } catch (e) {
      console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    }
  }

  return updateArticleArray;
};

export const updateArticleItem = async (inputObj) => {
  if (!inputObj || !inputObj.url || !inputObj.picArray || !inputObj.picArray.length) return null;
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

  const updateArticleModel = new dbModel(updateParams, articles);
  const storeData = await updateArticleModel.updateArrayNested();
  console.log("STORE DATA");
  console.log(storeData);

  return updateParams;
};

//-----------------------------

//update pic sets
export const updatePicSetPics = async () => {
  const { picSets } = CONFIG;

  const picSetDataModel = new dbModel({ keyExists: "url", arrayKey: "picArray", keyEmpty: "picSize" }, picSets);
  const picSetDataArray = await picSetDataModel.findEmptyItemsNested();
  if (!picSetDataArray || !picSetDataArray.length) return null;

  console.log("PIC SETS TO UPDATE");
  console.log(picSetDataArray);

  const updatePicSetArray = [];
  for (const picSet of picSetDataArray) {
    try {
      const updatePicSetData = await updatePicSetItem(picSet);
      updatePicSetArray.push(updatePicSetData);
    } catch (e) {
      console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    }
  }

  return updatePicSetArray;
};

export const updatePicSetItem = async (inputObj) => {
  if (!inputObj || !inputObj.url || !inputObj.picArray || !inputObj.picArray.length) return null;
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

  const updatePicSetModel = new dbModel(updateParams, picSets);
  const storeData = await updatePicSetModel.updateArrayNested();
  console.log("STORE DATA");
  console.log(storeData);

  return updateParams;
};

//--------------

//update vid pages
export const updateVidPageThumbnail = async () => {
  const { vidPages } = CONFIG;

  const vidPageDataModel = new dbModel({ keyExists: "url", arrayKey: "thumbnailData", keyEmpty: "picSize" }, vidPages);
  const vidPageDataArray = await vidPageDataModel.findEmptyItemsNested();
  if (!vidPageDataArray || !vidPageDataArray.length) return null;

  console.log("VID PAGES TO UPDATE");
  console.log(vidPageDataArray);

  const updateVidPageArray = [];
  for (const vidPage of vidPageDataArray) {
    try {
      const updateVidPageData = await updateThumbnailItem(vidPage);
      if (!updateVidPageData) continue;
      updateVidPageArray.push(updateVidPageData);
    } catch (e) {
      console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    }
  }

  return updateVidPageArray;
};

export const updateThumbnailItem = async (inputObj) => {
  if (!inputObj || !inputObj.url || !inputObj.thumbnailURL) return null;
  const { thumbnailURL, url } = inputObj;
  const { vidPages } = CONFIG;

  const picData = await getPicData(thumbnailURL);
  if (!picData) return null;

  const updateParams = {
    keyToLookup: "url",
    itemValue: url,
    insertKey: "thumbnailData",
    updateObj: picData,
  };

  const updateVidPageModel = new dbModel(updateParams, vidPages);
  const storeData = await updateVidPageModel.updateObjInsert();
  console.log("STORE DATA");
  console.log(storeData);

  //return picData of the thumbnail
  return picData;
};

//------

export const rebuildPicArray = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const rebuiltPicArray = [];
  for (const url of inputArray) {
    const picData = await getPicData(url);
    if (!picData) continue;

    rebuiltPicArray.push(picData);
  }

  return rebuiltPicArray;
};

export const getPicData = async (url) => {
  if (!url) return null;
  const { pics } = CONFIG;

  const lookupPicModel = new dbModel({ keyToLookup: "url", itemValue: url }, pics);
  const picData = await lookupPicModel.getUniqueItem();

  return picData;
};

//-------------------------------------

export const updateVidDataKCNA = async () => {
  const { vidPages } = CONFIG;

  console.log("UPDATING VID DATA");

  const vidPageVidModel = new dbModel({ arrayKey: "vidData", keyEmpty: "vidSize" }, vidPages);
  const vidPageDataArray = await vidPageVidModel.findEmptyItemsNested();
  if (!vidPageDataArray || !vidPageDataArray.length) return null;

  const updateVidPageArray = [];
  for (const vidPage of vidPageDataArray) {
    try {
      const updateVidPageData = await updateVidItem(vidPage);
      if (!updateVidPageData) continue;
      updateVidPageArray.push(updateVidPageData);
    } catch (e) {
      console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    }
  }

  return updateVidPageArray;
};

export const updateVidItem = async (inputObj) => {
  if (!inputObj || !inputObj.url || !inputObj.vidURL) return null;
  const { url, vidURL } = inputObj;
  const { vidPages } = CONFIG;

  const vidData = await getVidData(vidURL);
  if (!vidData) return null;

  const updateParams = {
    keyToLookup: "url",
    itemValue: url,
    insertKey: "vidData",
    updateObj: vidData,
  };

  const updateVidPageModel = new dbModel(updateParams, vidPages);
  const storeData = await updateVidPageModel.updateObjInsert();
  console.log("STORE DATA");
  console.log(storeData);

  return vidData;
};

export const getVidData = async (url) => {
  if (!url) return null;
  const { vids } = CONFIG;

  const lookupVidModel = new dbModel({ keyToLookup: "url", itemValue: url }, vids);
  const vidData = await lookupVidModel.getUniqueItem();

  return vidData;
};
