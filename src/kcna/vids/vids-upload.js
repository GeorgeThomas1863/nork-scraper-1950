import { tgPostPicFS, tgPostVidFS } from "../../tg/tg-api.js";
import { deleteVidChunks } from "./vids-chunk.js";
import kcnaState from "../util/state.js";

export const postVidThumbnailTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId, thumbnailData } = inputObj;

  if (!kcnaState.scrapeActive) return null;

  const thumbnailCaption = await buildVidThumbnailCaption(inputObj);

  const params = {
    chatId: tgChannelId,
    savePath: thumbnailData.savePath,
    caption: thumbnailCaption,
    mode: "html",
  };

  try {
    const data = await tgPostPicFS(params);
    return data;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};

export const buildVidThumbnailCaption = async (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, chunkArray, vidPageId, urlNormal } = inputObj;

  const chunkCount = chunkArray.length;

  const captionText = `🇰🇵 🇰🇵 🇰🇵
  
-----------------
        
<b>VID TITLED: ${title}</b>
      
-----------------
  
<b>${chunkCount} CHUNK VID</b> | <b>VID PAGE ID:</b> ${vidPageId} | <b>DATE:</b> <i>${dateNormal}</i> | <b>URL:</b> 
<i>${urlNormal}</i>
      `;

  return captionText;
};

//----------------------------

export const postVidChunkArrayTG = async (inputObj) => {
  if (!inputObj || !inputObj.chunkArray || !inputObj.chunkArray.length) return null;
  const { chunkArray, tgChannelId, dateNormal, urlNormal } = inputObj;

  const vidPostDataArray = [];
  for (let i = 0; i < chunkArray.length; i++) {
    if (!kcnaState.scrapeActive) return vidPostDataArray;

    try {
      const chunk = chunkArray[i];
      chunk.chunkIndex = i + 1;
      chunk.chunkCount = chunkArray.length;
      chunk.mode = "html";

      const postChunkObj = { ...chunk, tgChannelId, dateNormal, urlNormal };
      const vidChunkCaption = await buildVidChunkCaption(postChunkObj);
      postChunkObj.caption = vidChunkCaption;
      const vidPostData = await tgPostVidFS(postChunkObj);
      if (!vidPostData) continue;

      console.log("VID POST DATA");
      console.log(vidPostData);

      vidPostDataArray.push(vidPostData);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
      continue;
    }
  }

  await deleteVidChunks(chunkArray);

  return vidPostDataArray;
};

export const buildVidChunkCaption = async (inputObj) => {
  if (!inputObj) return null;
  const { chunkIndex, chunkCount, dateNormal, urlNormal } = inputObj;

  const captionText = `
<b>VID CHUNK ${chunkIndex} OF ${chunkCount}</b> | <b>DATE:</b> <i>${dateNormal}</i> | <b>VID URL:</b> 
<i>${urlNormal}</i>`;

  return captionText;
};
