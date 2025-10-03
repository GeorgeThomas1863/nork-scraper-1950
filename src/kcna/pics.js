import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

export const downloadPicsKCNA = async () => {
  const { pics, picPath } = CONFIG;
  const picModel = new dbModel({ keyExists: "url", keyEmpty: "picSize" }, pics);
  const picArray = await picModel.findEmptyItems();

  //CREATE PIC ID AND SAVE IT EARLIER IN PIC DB (maybe make last couple chars in URL?)
  for (const picItem of picArray) {
    const { url } = picItem;
    const picData = await downloadPicFS(url, savePath);

    console.log("PIC TO DOWNLOAD ARRAY");
    console.log(picArray);
  }
};

export const downloadPicFS = async (url, savePath) => {
  const picExists = fs.existsSync(savePath);
  if (picExists) {
    const error = new Error("PIC ALREADY DOWNLOADED");
    error.url = url;
    error.function = "downloadPicFS";
    throw error;
  }
};

export const uploadPicsKCNA = async () => {
  //build
};
