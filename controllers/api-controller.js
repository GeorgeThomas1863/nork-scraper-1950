import { handleIncomingAPI } from "../src/control.js";
// import { scrapeState } from "../src/state.js";

//api receive endpoint for scraper
export const apiEndpointController = async (req, res) => {
  try {
    const inputParams = req.body;

    console.log("API INCOMING DATA");
    console.log(inputParams);

    //updates the scrapeState
    const data = await handleIncomingAPI(inputParams);
    console.log("API INCOMING RESPONSE");
    console.log(data);

    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ e: "SCRAPER FAILED TO HANDLE INCOMING DATA REQ" });
  }
};

export const apiSendController = async (req, res) => {
  const { apiDisplayer, displayPort } = CONFIG;

  try {
    const inputParams = req.body;
    console.log("API OUTGOING DATA");
    console.log(inputParams);

    const url = `https://localhost:${displayPort}${apiDisplayer}`;

    const apiRes = await axios.post(url, inputParams);
    if (!apiRes) return null;
    const data = apiRes.data;

    console.log("API OUTGOING RESPONSE");
    console.log(data);
    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ e: "SCRAPER FAILED TO GET OUTGOING DATA RES" });
  }
};
