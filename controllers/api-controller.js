import { runScraper } from "../src/src.js";

//api receive endpoint for scraper
export const apiEndpointController = async (req, res) => {
  const inputParams = req.body;

  if (inputParams.password !== process.env.API_PASSWORD) return res.status(401).json({ error: "unauthorized" });

  console.log("API INCOMING DATA");
  console.log(buildRequestContext(inputParams));

  try {
    const data = await runScraper(inputParams);
    console.log("API INCOMING RESPONSE");
    console.log(data);
    return res.json(data);
  } catch (e) {
    console.log("API ERROR: " + e.message);
    return res.status(500).json({ error: e.apiMessage || "Scraper command failed" });
  }
};

const buildRequestContext = (inputParams) => {
  const { command, howMuch } = inputParams;
  return { command, howMuch };
};
