import fs from "fs";
import FormData from "form-data";
import tokenArray from "../../config/tg-bot.js";
// import state from "./state.js";

import { tgPostReq, tgPostPicReq, checkToken } from "./tg-api.js";

let tokenIndex = 0;

export const tgSendMessage = async (inputParams) => {
  //   if (!state.active) return null;
  const token = tokenArray[tokenIndex];

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const data = await tgPostReq(url, inputParams);

  const checkData = await checkToken(data, tokenIndex);

  //try again
  if (!checkData) return await tgSendMessage(inputParams);

  return data;
};

export const tgPostPicFS = async (inputParams) => {
  if (!inputParams) return null;
  const { chatId, savePath, caption, mode } = inputParams;

  const token = tokenArray[tokenIndex];
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  //build form
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", fs.createReadStream(savePath));
  form.append("caption", caption);
  form.append("parse_mode", mode);

  const data = await tgPostPicReq(url, form);

  const checkData = await checkToken(data, tokenIndex);

  if (!checkData) return await tgPostPicFS(inputParams);

  return data;
};

// export const tgEditMessageCaption = async (inputParams) => {
//   //   if (!state.active) return null;
//   //   const { editChannelId, messageId, caption } = inputParams;
//   const token = tokenArray[tokenIndex];

//   //   const params = {
//   //     chat_id: editChannelId,
//   //     message_id: messageId,
//   //     caption: caption,
//   //   };

//   const url = `https://api.telegram.org/bot${token}/editMessageCaption`;
//   const data = await tgPostReq(url, inputParams);

//   const checkData = await checkToken(data);

//   //try again
//   if (!checkData) return await tgEditMessageCaption(inputParams);

//   return data;
// };
