import { tgPostPicFS } from "../../tg-api.js";

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
  
<b>${chunkCount} CHUNK VID</b> | <b>VID PAGE ID:</b> ${vidPageId} | <b>DATE:</b> <i>${dateNormal}</i> | <b>VID PAGE URL:</b> 
<i>${url}</i>
      `;

  return captionText;
};
