import { handleIncomingAPI, handleOutgoingAPI } from "../src/control.js";
// import { scrapeState } from "../src/state.js";

export const apiIncomingController = async (req, res) => {
  const inputParams = req.body;

  console.log("API INCOMING DATA");
  console.log(inputParams);

  //updates the scrapeState
  const data = await handleIncomingAPI(inputParams);
  console.log("API INCOMING RESPONSE");
  console.log(data);

  return res.json(data);
};

export const apiOutgoingController = async (req, res) => {
  try {
    const inputParams = req.body;
    console.log("API OUTGOING DATA");
    console.log(inputParams);

    const data = await handleOutgoingAPI(inputParams);
    console.log("API OUTGOING RESPONSE");
    console.log(data);

    return res.json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ e: "Failed to get admin backend data" });
  }
};
