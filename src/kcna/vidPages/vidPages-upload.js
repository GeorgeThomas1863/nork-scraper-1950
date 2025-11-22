import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import kcnaState from "../util/state.js";

import { normalizeTGInputs, sortArrayByDate } from "../util/util.js";
import { chunkVidFS } from "../vids/vids-chunk.js";
import { postVidThumbnailTG, postVidChunkArrayTG } from "../vids/vids-upload.js";
import { updateLogKCNA } from "../util/log.js";

export const uploadVidPagesKCNA = async () => {
  const { vidPages, tgChannelId } = CONFIG;
  if (!kcnaState.scrapeActive) return null;

  const vidPageModel = new dbModel({ keyExists: "url", keyEmpty: "chunksUploaded" }, vidPages);
  const vidPageArray = await vidPageModel.findEmptyItems();
  if (!vidPageArray || !vidPageArray.length) return null;

  const vidPageArraySorted = await sortArrayByDate(vidPageArray, "vidPages");

  const vidPagePostDataArray = [];
  for (const vidPage of vidPageArraySorted) {
    if (!kcnaState.scrapeActive) return vidPagePostDataArray;

    try {
      const { url } = vidPage;

      //add channelId HERE
      vidPage.tgChannelId = tgChannelId;

      // console.log("!!!!POST VID PAGE INPUT OBJ!!!!");
      // console.log(vidPage);

      //post vidPage
      const vidPagePostData = await postVidPageTG(vidPage);
      if (!vidPagePostData) continue;

      //add uploaded flag
      vidPagePostData.uploaded = true

      // console.log("VID PAGE POST DATA");
      // console.log(vidPagePostData);

      vidPagePostDataArray.push(vidPagePostData);

      //store data
      const storeModel = new dbModel({ keyToLookup: "url", itemValue: url, updateObj: vidPagePostData }, vidPages);
      const storeData = await storeModel.updateObjItem();
      console.log("VID PAGE UPLOAD STORE DATA");
      console.log(storeData);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  kcnaState.scrapeStep = "UPDATING STUFF KCNA";
  kcnaState.scrapeMessage = `FINISHED UPLOADING ${vidPagePostDataArray.length} NEW VID PAGES TO TG`;
  await updateLogKCNA();

  return vidPagePostDataArray;
};

export const postVidPageTG = async (inputObj) => {
  if (!inputObj) return null;
  const { url, date } = inputObj;

  //normalize url and date
  const tgInputs = await normalizeTGInputs(url, date);
  const vidChunkObj = { ...inputObj, ...tgInputs };

  try {
    const uploadObj = await chunkVidFS(vidChunkObj);
    if (!uploadObj) return null;

    // post thumbnail as title
    await postVidThumbnailTG(uploadObj);

    const vidPostData = await postVidChunkArrayTG(uploadObj);
    if (!vidPostData || !vidPostData.length) return vidChunkObj;

    vidChunkObj.chunksUploaded = vidPostData.length;
    return vidChunkObj;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};
