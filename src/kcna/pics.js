import CONFIG from "../../config/config.js";
import dbModel from "../../models/db-model.js";

export const downloadPicsKCNA = async () => {
  const { pics } = CONFIG;
  const picModel = new dbModel({ keyExists: "url", keyEmpty: "picSize" }, pics);
  const picArray = await picModel.findEmptyItems();

  console.log("PIC TO DOWNLOAD ARRAY");
  console.log(picArray);
};

export const uploadPicsKCNA = async () => {
  //build
};
