import axios from "axios";
import fs from "fs";
import FormData from "form-data";

const tokenArray = process.env.TOKEN_ARRAY.split(',').map(key => process.env[key.trim()]).filter(Boolean);

let tokenIndex = 0;

export const tgSendMessage = async (inputParams, attempt = 0) => {
  if (attempt >= tokenArray.length) {
    console.log("ALL TOKENS EXHAUSTED FOR sendMessage");
    return null;
  }

  const token = tokenArray[tokenIndex];
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const data = await tgPostReq(url, inputParams);

  const verdict = checkToken(data);

  if (verdict === "ok") return data;

  if (verdict === "fatal") {
    logFatalError("sendMessage", data);
    return null;
  }

  rotateToken();
  return await tgSendMessage(inputParams, attempt + 1);
};

export const tgPostPicFS = async (inputParams, attempt = 0) => {
  if (!inputParams) return null;

  if (attempt >= tokenArray.length) {
    console.log("ALL TOKENS EXHAUSTED FOR sendPhoto");
    return null;
  }

  const token = tokenArray[tokenIndex];
  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  try {
    const picForm = await buildPicForm(inputParams);

    if (!picForm) return null;
    const data = await tgPostPicReq(url, picForm);
    const verdict = checkToken(data);

    if (verdict === "ok") return data;

    if (verdict === "fatal") {
      logFatalError("sendPhoto", data);
      return null;
    }

    rotateToken();
    return await tgPostPicFS(inputParams, attempt + 1);
  } catch (e) {
    console.log(e.response?.data ?? e.message);
    return null;
  }
};

//-----------------------

export const tgGetReq = async (url) => {
  if (!url) return null;
  try {
    const res = await axios.get(url);
    return res.data;
  } catch (e) {
    console.log(e.response?.data ?? e.message);
    //axios throws error on 429, so need to return
    return e.response?.data;
  }
};

export const tgPostReq = async (url, params) => {
  if (!url || !params) return null;

  try {
    const res = await axios.post(url, params);
    return res.data;
  } catch (e) {
    console.log(e.response?.data ?? e.message);
    //axios throws error on 429, so need to return
    return e.response?.data;
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
    console.log(e.response?.data ?? e.message);
    //axios throws error on 429, so need to return
    return e.response?.data;
  }
};

export const buildPicForm = async (inputObj) => {
  if (!inputObj) return null;
  const { chatId, savePath, caption, mode } = inputObj;

  //must come first; fs.existsSync(undefined) triggers a DEP0187 deprecation warning
  if (!savePath) {
    console.log("PIC FILE PATH MISSING");
    return null;
  }

  if (!fs.existsSync(savePath)) {
    console.log("PIC FILE NOT FOUND: " + savePath);
    return null;
  }

  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("photo", fs.createReadStream(savePath));
    form.append("caption", caption);
    form.append("parse_mode", mode);
    return form;
  } catch (e) {
    console.log(e.message);
    return null;
  }
};

//failures a DIFFERENT token can fix; rate limited, or bad/revoked token with no access
const rotatableCodes = [401, 403, 429];

//returns a verdict: "ok" / "retry" (another token may work) / "fatal" (no token can fix it)
export const checkToken = (data) => {
  if (data && data.ok) return "ok";

  const errorCode = data?.error_code;

  //no response at all (network error) or unrecognized shape; rotating is harmless
  if (!errorCode) return "retry";

  if (rotatableCodes.includes(errorCode)) return "retry";

  //every other client error is caused by the request itself, not the token
  if (errorCode >= 400 && errorCode < 500) return "fatal";

  //5xx from telegram
  return "retry";
};

export const rotateToken = () => {
  tokenIndex++;

  if (tokenIndex >= tokenArray.length) tokenIndex = 0;

  console.log("Token failed, rotating to token index: " + tokenIndex);
};

export const logFatalError = (method, data) => {
  console.log(`TG ${method} FAILED, NOT RETRYING (${data?.error_code}): ${data?.description}`);
};
