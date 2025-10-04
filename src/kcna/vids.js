import path from "path";
import fs from "fs";
import axios from "axios";

import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

export const downloadVidsKCNA = async () => {
  const { vids, vidPath, tempPath } = CONFIG;
  const vidModel = new dbModel({ keyExists: "url", keyEmpty: "vidSize" }, vids);
  const vidArray = await vidModel.findEmptyItems();
  if (!vidArray || !vidArray.length) return null;

  console.log("DOWNLOAD VID ARRAY");
  console.log(vidArray);

  const downloadVidArray = [];
  for (const vidItem of vidArray) {
    const { vidId, url } = vidItem;
    vidItem.vidName = vidId + ".mp4";
    vidItem.savePath = path.join(vidPath, vidItem.vidName);
    vidItem.vidTempPath = path.join(tempPath, vidItem.vidName);

    const vidData = await downloadVidFS(vidItem);
  }
};

export const downloadVidFS = async (inputParams) => {
  if (!inputParams) return null;

  console.log("DOWNLOAD VID INPUT PARAMS");
  console.log(inputParams);
};

export const uploadVidsKCNA = async () => {
  //build
};
