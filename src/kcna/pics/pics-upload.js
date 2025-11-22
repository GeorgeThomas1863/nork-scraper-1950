import CONFIG from "../../../config/config.js";
import { tgPostPicFS } from "../../tg/tg-api.js";
import kcnaState from "../util/state.js";

export const postPicArrayTG = async (inputArray) => {
  if (!inputArray || !inputArray.length) return null;

  const postPicDataArray = [];
  for (const pic of inputArray) {
    if (!kcnaState.scrapeActive) return postPicDataArray;

    try {
      const postPicData = await postPicTG(pic);
      if (!postPicData) continue;

      //add uploaded flag
      postPicData.uploaded = true

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

  if (!kcnaState.scrapeActive) return null;

  const params = {
    chatId: tgChannelId,
    savePath: savePath,
    caption: caption,
    mode: "html",
  };

  try {
    const data = await tgPostPicFS(params);
    if (!data) return null;

    console.log("PIC UPLOAD POST DATA");
    console.log(data);

    return data;
  } catch (e) {
    console.log(e.url + "; " + e.message + "; F BREAK: " + e.function);
    return null;
  }
};
