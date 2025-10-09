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

  const checkData = await checkToken(data);

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

export const buildVidChunkForm = async (inputObj) => {
  if (!inputObj) return null;
  const { chunkPath, tgChannelId, chunkName } = inputObj;

  const readStream = fs.createReadStream(chunkPath);

  // Create form data for this chunk
  const formData = new FormData();
  formData.append("chat_id", tgChannelId);
  formData.append("video", readStream, {
    filename: chunkName,
  });

  //set setting for auto play / streaming
  formData.append("supports_streaming", "true");
  formData.append("width", "1280");
  formData.append("height", "720");

  if (!formData || !readStream) {
    const error = new Error("BUILD VID FORM FUCKED");
    error.content = "FORM DATA: " + formData;
    error.function = "buildVidForm";
    throw error;
  }

  return formData;
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
    const res = await axios.post(url, vidChunkForm, {
      headers: vidChunkForm.getHeaders(),
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

// export const tgPostVidChunkFS = async (inputParams) => {
//   if (!inputParams) return null;
//   const { chatId, savePath, caption, mode } = inputParams;

//   const token = tokenArray[tokenIndex];
//   const url = `https://api.telegram.org/bot${token}/sendVideo`;

//   const vidChunkForm = await buildVidChunkForm(inputParams);

//   const totalLength = await new Promise((resolve, reject) => {
//     vidChunkForm.getLength((err, length) => {
//       if (err) reject(err);
//       else resolve(length);
//     });
//   });

//   const totalMB = (totalLength / (1024 * 1024)).toFixed(2);
//   const startTime = Date.now();

//   console.log(`STARTING UPLOAD OF ${totalMB}MB VIDEO...`);

//   // Progress logger every 5 seconds
//   const progressInterval = setInterval(() => {
//     const elapsed = (Date.now() - startTime) / 1000;
//     console.log(`Seconds Elapsed: ${elapsed.toFixed(1)}s`);
//   }, 5000); // Every 2 seconds

//   try {
//     const res = await axios.post(url, vidChunkForm, {
//       headers: vidChunkForm.getHeaders(),
//       maxBodyLength: Infinity,
//       maxContentLength: Infinity,
//     });

//     clearInterval(progressInterval);
//     const duration = ((Date.now() - startTime) / 1000).toFixed(1);
//     const avgSpeed = (totalMB / duration).toFixed(2);
//     console.log(`Upload completed! ${totalMB}MB in ${duration}s (avg: ${avgSpeed} MB/s)`);

//     // console.log("!!!!!!RES");
//     // console.log(res.data);

//     return res.data;
//   } catch (e) {
//     clearInterval(progressInterval);
//     console.log("ERROR");
//     console.log(e);

//     if (e.response && e.response.data) {
//       //check token
//       const checkModel = new TgReq({ data: e.response.data });
//       const checkData = await checkModel.checkToken();

//       if (checkData) {
//         const inputData = this.dataObject;
//         const retryModel = new TgReq(inputData);
//         const retryData = await retryModel.tgVidFS(TgReq.tokenIndex);
//         return retryData;
//       }
//     } else {
//       return e;
//     }
//   }
// };
