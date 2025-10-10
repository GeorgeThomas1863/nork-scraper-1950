import axios from "axios";
import CONFIG from "../../../config/config.js";

export const updateDisplayerKCNA = async (inputParams) => {
  const { apiDisplayer, displayPort } = CONFIG;

  console.log("API OUTGOING DATA");
  console.log(inputParams);

  try {
    const url = `http://localhost:${displayPort}${apiDisplayer}`;

    const res = await axios.post(url, inputParams);
    const data = res.data;

    console.log("API OUTGOING RESPONSE");
    console.log(data);
    return data;
  } catch (e) {
    console.log(`SCRAPER FAILED TO UPDATE DISPLAYER: ${e.message}`);
    return null;
  }
};
