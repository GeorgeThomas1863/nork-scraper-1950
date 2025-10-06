import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import tokenArray from "../config/tg-bot.js";

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

//-----------------------

export const tgGetReq = async (url) => {
  //   if (!state.active) return null;
  if (!url) return null;
  try {
    const res = await axios.get(url);
    return res.data;
  } catch (e) {
    console.log(e.response.data);
    //axios throws error on 429, so need to return
    return e.response.data;
  }
};

export const tgPostReq = async (url, params) => {
  //   if (!state.active) return null;
  if (!url || !params) return null;

  try {
    const res = await axios.post(url, params);
    return res.data;
  } catch (e) {
    console.log(e.response.data);
    //axios throws error on 429, so need to return
    return e.response.data;
  }
};

export const tgPostPicReq = async (url, form) => {
  if (!url || !form) return null;

  try {
    const res = await axios.post(url, form, {
      headers: form.getHeaders(),
    });
    return res.data;
  } catch (e) {
    console.log(e.response.data);
    //axios throws error on 429, so need to return
    return e.response.data;
  }
};

export const checkToken = async (data, tokenIndex) => {
  //   if (!state.active) return null;
  if (data && data.ok) return true;

  if (data && data.error_code && data.error_code !== 429) return true;

  console.log("HERE FAGGOT");
  console.log(data);

  //otherwise bot fucked, return null
  console.log("AHHHHHHHHHHHHH");
  tokenIndex++;

  if (tokenIndex > 11) tokenIndex = 0;

  console.log("CANT GET UPDATES TRYING NEW FUCKING BOT. TOKEN INDEX:" + tokenIndex);
  return null;
};
