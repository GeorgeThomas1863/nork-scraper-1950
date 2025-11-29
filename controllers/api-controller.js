import { runScraper } from "../src/src.js";

//api receive endpoint for scraper
export const apiEndpointController = async (req, res) => {
  const inputParams = req.body;

  console.log("API INCOMING DATA");
  console.log(inputParams);

  //updates the scrapeState
  const data = await runScraper(inputParams);
  console.log("API INCOMING RESPONSE");
  console.log(data);

  return res.json(data);
};
