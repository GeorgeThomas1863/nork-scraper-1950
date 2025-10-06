import CONFIG from "../../../config/config.js";
import { tgPostPicFS } from "../../tg-api.js";

export const postPicArrayTG = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const postPicDataArray = [];
  for (const pic of inputArray) {
    try {
      const postPicData = await postPicTG(pic);
      if (!postPicData) continue;
      postPicDataArray.push(postPicData);
    } catch (e) {
      console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    }
  }

  return postPicDataArray;
};

export const postPicTG = async (inputObj) => {
  if (!inputObj) return null;
  const { savePath, caption } = inputObj;
  const { tgChannelId } = CONFIG;

  const params = {
    chatId: tgChannelId,
    savePath: savePath,
    caption: caption,
    mode: "html",
  };

  const data = await tgPostPicFS(params);

  console.log("POST PIC DATA");
  console.log(data);

  return data;
};
