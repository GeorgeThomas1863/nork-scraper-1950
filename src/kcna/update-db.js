import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

//UPDATE DB (with full pic data in each collection)
export const updatePicDataKCNA = async () => {
  //returns array of data that needs to be updated
  const collectionsToUpdate = await getCollectionsToUpdate();

  //for tracking
  const updateArray = [];
  const updateArticleData = await updateArticlePics(collectionsToUpdate[0]);
  const updatePicSetData = await updatePicSetPics(collectionsToUpdate[1]);
  const updateVidData = await updateVidPageThumbnail(collectionsToUpdate[2]);
  updateArray.push(updateArticleData, updatePicSetData, updateVidData);

  return updateArray;
};

export const getCollectionsToUpdate = async () => {
  const { articles, picSets, vidPages } = CONFIG;

  const collectionArr = [articles, picSets, vidPages];

  const collectionData = [];
  for (const collection of collectionArr) {
    const model = new dbModel("", collection);
    const dataArray = await model.getAll();
    if (!dataArray || !dataArray.length) continue;

    collectionData.push(dataArray);
  }

  return collectionData;
};

//----------

//update articles
export const updateArticlePics = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  //update articles
  const updateArticleArray = [];
  for (const article of inputArray) {
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
export const updatePicSetPics = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const updatePicSetArray = [];
  for (const picSet of inputArray) {
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
export const updateVidPageThumbnail = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const updateVidPageArray = [];
  for (const vidPage of inputArray) {
    try {
      const updateVidPageData = await updateVidPageItem(vidPage);
      if (!updateVidPageData) continue;
      updateVidPageArray.push(updateVidPageData);
    } catch (e) {
      console.log(e.message + "; URL: " + e.url + "; F BREAK: " + e.function);
    }
  }

  return updateVidPageArray;
};

export const updateVidPageItem = async (inputObj) => {
  if (!inputObj || !inputObj.url || !inputObj.thumbnailURL) return null;
  const { url, thumbnailURL } = inputObj;
  const { vidPages } = CONFIG;

  const picData = await getPicData(thumbnailURL);
  if (!picData) return null;

  const updateVidPageModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: picData }, vidPages);
  const storeData = await updateVidPageModel.updateObjItem();
  console.log("UPDATE DATA");
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
