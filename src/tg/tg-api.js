import axios from "axios";
import fs from "fs";
import FormData from "form-data";
import tokenArray from "../../config/tg-bot.js";

let tokenIndex = 0;

export const tgSendMessage = async (inputParams) => {
  //   if (!state.active) return null;
  const token = tokenArray[tokenIndex];

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const data = await tgPostReq(url, inputParams);

  const checkData = await checkToken(data);

  //try again
  if (!checkData) return await tgSendMessage(inputParams);

  return data;
};

export const tgPostPicFS = async (inputParams) => {
  if (!inputParams) return null;

  const token = tokenArray[tokenIndex];
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  const picForm = await buildPicForm(inputParams);

  const data = await tgPostPicReq(url, picForm);

  const checkData = await checkToken(data);

  if (!checkData) return await tgPostPicFS(inputParams);

  return data;
};

export const tgPostVidFS = async (inputParams) => {
  if (!inputParams) return null;
  const { chunkPath } = inputParams;

  const token = tokenArray[tokenIndex];
  const url = `https://api.telegram.org/bot${token}/sendVideo`;

  const vidChunkForm = await buildVidChunkForm(inputParams);

  console.log(`STARTING UPLOAD OF ${chunkPath}...`);

  const data = await tgPostVidReq(url, vidChunkForm);

  const checkData = await checkToken(data);

  if (!checkData) return await tgPostVidFS(inputParams);

  return data;
};

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

export const tgPostVidReq = async (url, form) => {
  if (!url || !form) return null;

  try {
    const res = await axios.post(url, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return res.data;
  } catch (e) {
    console.log(e.response.data);
    //axios throws error on 429, so need to return
    return e.response.data;
  }
};

export const checkToken = async (data) => {
  //   if (!state.active) return null;
  if (data && data.ok) return true;

  if (data && data.error_code && data.error_code !== 429) return true;

  //otherwise bot fucked, return null
  console.log("AHHHHHHHHHHHHH");
  tokenIndex++;

  if (tokenIndex > 11) tokenIndex = 0;

  console.log("CANT GET UPDATES TRYING NEW FUCKING BOT. TOKEN INDEX:" + tokenIndex);
  return null;
};

//---------------------------

export const buildPicForm = async (inputObj) => {
  if (!inputObj) return null;
  const { chatId, savePath, caption, mode } = inputObj;

  //build form
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("photo", fs.createReadStream(savePath));
  form.append("caption", caption);
  form.append("parse_mode", mode);

  if (!form || !fs.createReadStream(savePath)) {
    const error = new Error("BUILD PIC FORM FUCKED");
    error.content = "FORM DATA: " + form;
    error.function = "buildPicForm";
    throw error;
  }

  return form;
};

export const buildVidChunkForm = async (inputObj) => {
  if (!inputObj) return null;
  const { chunkPath, tgChannelId, chunkName, caption, mode } = inputObj;

  const readStream = fs.createReadStream(chunkPath);

  // Create form data for this chunk
  const form = new FormData();
  form.append("chat_id", tgChannelId);
  form.append("video", readStream, {
    filename: chunkName,
  });

  //caption
  form.append("caption", caption);
  form.append("parse_mode", mode);

  //set setting for auto play / streaming
  form.append("supports_streaming", "true");
  form.append("width", "1280");
  form.append("height", "720");

  if (!form || !readStream) {
    const error = new Error("BUILD VID FORM FUCKED");
    error.content = "FORM DATA: " + form;
    error.function = "buildVidChunkForm";
    throw error;
  }

  return form;
};
