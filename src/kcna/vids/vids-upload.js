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
  
<b>${chunkCount} CHUNK VID</b> | <b>VID PAGE ID:</b> ${vidPageId} | <b>DATE:</b> <i>${dateNormal}</i> | <b>URL:</b> 
<i>${url}</i>
      `;

  return captionText;
};

//----------------------------

export const postVidTG = async (inputObj) => {
  if (!inputObj) return null;

  const vidForm = await buildVidForm(inputObj);
};

export const buildVidForm = async (inputObj) => {
  if (!inputObj) return null;
  //   const { uploadPath, tgUploadId, uploadFileName } = inputObj;

  console.log("BUILD VID FORM INPUT OBJ");
  console.log(inputObj);

  //   const readStream = fs.createReadStream(uploadPath);

  //   // Create form data for this chunk
  //   const formData = new FormData();
  //   formData.append("chat_id", tgUploadId);
  //   formData.append("video", readStream, {
  //     filename: uploadFileName,
  //   });

  //   //set setting for auto play / streaming
  //   formData.append("supports_streaming", "true");
  //   formData.append("width", "1280");
  //   formData.append("height", "720");

  //   if (!formData || !readStream) {
  //     const error = new Error("BUILD VID FORM FUCKED");
  //     error.content = "FORM DATA: " + formData;
  //     error.function = "buildVidForm";
  //     throw error;
  //   }

  //   return formData;
};
