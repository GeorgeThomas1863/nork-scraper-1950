import fs from "fs";
import { tgPostPicFS, tgPostVidFS } from "../../tg-api.js";

export const postVidThumbnailTG = async (inputObj) => {
  if (!inputObj) return null;
  const { tgChannelId, thumbnailData } = inputObj;

  const thumbnailCaption = await buildVidThumbnailCaption(inputObj);

  const params = {
    chatId: tgChannelId,
    savePath: thumbnailData.savePath,
    caption: thumbnailCaption,
    mode: "html",
  };

  const data = await tgPostPicFS(params);
  return data;
};

export const buildVidThumbnailCaption = async (inputObj) => {
  if (!inputObj) return null;
  const { title, dateNormal, chunkArray, vidPageId, url } = inputObj;

  const chunkCount = chunkArray.length;

  const captionText = `🇰🇵 🇰🇵 🇰🇵
  
-----------------
        
<b>VID TITLED: ${title}</b>
      
-----------------
  
<b>${chunkCount} CHUNK VID</b> | <b>VID PAGE ID:</b> ${vidPageId} | <b>DATE:</b> <i>${dateNormal}</i> | <b>URL:</b> 
<i>${url}</i>
      `;

  return captionText;
};

//----------------------------

export const postVidChunkArrayTG = async (inputObj) => {
  if (!inputObj || !inputObj.chunkArray || !inputObj.chunkArray.length) return null;
  const { chunkArray, tgChannelId, dateNormal, urlNormal } = inputObj;

  const vidPostDataArray = [];
  for (let i = 0; i < chunkArray.length; i++) {
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
  }

  return vidPostDataArray;
};

export const buildVidChunkCaption = async (inputObj) => {
  if (!inputObj) return null;
  const { chunkIndex, chunkCount, dateNormal, urlNormal } = inputObj;

  //   console.log("INPUT OBJ CAPTION");
  //   console.log(inputObj);

  const captionText = `
<b>VID CHUNK ${chunkIndex} OF ${chunkCount}</b> | <b>DATE:</b> <i>${dateNormal}</i> | <b>VID URL:</b> 
<i>${urlNormal}</i>`;

  return captionText;
};
