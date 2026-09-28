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

// Telegram says 50 MB without stating MB vs MiB; use the smaller decimal figure
export const TG_VID_MAX_BYTES = 50_000_000;

export const tgPostVidFS = async (inputParams, attempt = 0) => {
  if (!inputParams) return null;

  if (attempt >= tokenArray.length) {
    console.log("ALL TOKENS EXHAUSTED FOR sendVideo");
    return null;
  }

  const token = tokenArray[tokenIndex];
  const url = `https://api.telegram.org/bot${token}/sendVideo`;

  try {
    const vidForm = buildVidForm(inputParams);

    if (!vidForm) return null;
    const data = await tgPostPicReq(url, vidForm);
    const verdict = checkToken(data);

    if (verdict === "ok") return data;

    if (verdict === "fatal") {
      logFatalError("sendVideo", data);
      return null;
    }

    await waitRetryAfter(data);
    rotateToken();
    return await tgPostVidFS(inputParams, attempt + 1);
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

//returns the file size in bytes, or null if the stat call fails
const readFileSize = (savePath) => {
  try {
    return fs.statSync(savePath).size;
  } catch (e) {
    console.log(e.message);
    return null;
  }
};

export const buildVidForm = (inputObj) => {
  if (!inputObj) return null;
  const { chatId, savePath, caption, mode, thumbPath } = inputObj;

  //must come first; fs.existsSync(undefined) triggers a DEP0187 deprecation warning
  if (!savePath) {
    console.log("VID FILE PATH MISSING");
    return null;
  }

  if (!fs.existsSync(savePath)) {
    console.log("VID FILE NOT FOUND: " + savePath);
    return null;
  }

  const fileSize = readFileSize(savePath);
  if (fileSize === null) return null;

  if (fileSize >= TG_VID_MAX_BYTES) {
    console.log("VID FILE OVER TELEGRAM LIMIT");
    return null;
  }

  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("video", fs.createReadStream(savePath));

    if (caption) {
      form.append("caption", caption);
      form.append("parse_mode", mode);
    }

    form.append("supports_streaming", "true");

    if (thumbPath && fs.existsSync(thumbPath)) {
      form.append("thumbnail", fs.createReadStream(thumbPath));
    }

    return form;
  } catch (e) {
    console.log(e.message);
    return null;
  }
};

export const waitRetryAfter = async (data) => {
  const retryAfter = data?.parameters?.retry_after;

  if (typeof retryAfter !== "number" || retryAfter <= 0) return;

  const waitSeconds = Math.min(retryAfter, 60);
  console.log(`RATE LIMITED, WAITING ${waitSeconds}s BEFORE RETRY`);

  await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
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
