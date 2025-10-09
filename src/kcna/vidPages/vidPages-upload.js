import CONFIG from "../../../config/config.js";
import dbModel from "../../../models/db-model.js";
import { normalizeTGInputs, sortArrayByDate } from "../util/util.js";
import { chunkVidFS } from "../vids/vids-chunk.js";
import { postVidThumbnailTG, postVidChunkArrayTG } from "../vids/vids-upload.js";

export const uploadVidPagesKCNA = async () => {
  const { vidPages, tgChannelId } = CONFIG;
  const vidPageModel = new dbModel({ keyExists: "url", keyEmpty: "chunksUploaded" }, vidPages);
  const vidPageArray = await vidPageModel.findEmptyItems();
  if (!vidPageArray || !vidPageArray.length) return null;

  const vidPageArraySorted = await sortArrayByDate(vidPageArray);

  const vidPagePostDataArray = [];
  for (const vidPage of vidPageArraySorted) {
    try {
      const { url } = vidPage;

      //add channelId HERE
      vidPage.tgChannelId = tgChannelId;

      //post vidPage
      const vidPagePostData = await postVidPageTG(vidPage);
      if (!vidPagePostData) continue;
      vidPagePostDataArray.push(vidPagePostData);

      // console.log("VID PAGE POST DATA");
      // console.log(vidPagePostData);

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

  //normalize url and date
  const tgInputs = await normalizeTGInputs(url, date);
  const vidChunkObj = { ...inputObj, ...tgInputs };

  const uploadObj = await chunkVidFS(vidChunkObj);
  if (!uploadObj) return null;

  // post thumbnail as title
  await postVidThumbnailTG(uploadObj);
  // console.log("THUMBNAIL DATA");
  // console.log(thumbnailData);

  const vidPostData = await postVidChunkArrayTG(uploadObj);
  if (!vidPostData || !vidPostData.length) return vidChunkObj;

  vidChunkObj.chunksUploaded = vidPostData.length;
  return vidChunkObj;
};
