import { handleAdminCommand, runNewScrape } from "../src/control.js";
// import { scrapeState } from "../src/state.js";

export const apiRoute = async (req, res) => {
  const inputParams = req.body;

  //updates the scrapeState
  const data = await handleAdminCommand(inputParams);

  //return to displayer
  // res.json(scrapeState);

  // //runs the command sent
  // const result = await runNewScrape(data);

  // return result;
};
