import { runAPI } from "../src/src.js";

//api receive endpoint for scraper
export const apiEndpointController = async (req, res) => {
  try {
    const inputParams = req.body;

    console.log("API INCOMING DATA");
    console.log(inputParams);

    //updates the scrapeState
    const data = await runAPI(inputParams);
    console.log("API INCOMING RESPONSE");
    console.log(data);

    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ e: "SCRAPER FAILED TO HANDLE INCOMING DATA REQ" });
  }
};
