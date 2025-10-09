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
  const { chunkArray, tgChannelId } = inputObj;

  for (const chunk of chunkArray) {
    const postChunkObj = { ...chunk, tgChannelId };
    const vidPostData = await tgPostVidFS(postChunkObj);

    console.log("VID POST DATA");
    console.log(vidPostData);
  }
};
