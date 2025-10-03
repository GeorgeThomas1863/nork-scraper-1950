import { kcnaState, scrapeKCNA } from "./kcna/kcna-control.js";

export const handleAdminCommand = async (inputParams) => {
  const { command } = inputParams;

  console.log("API DATA");
  console.log(inputParams);

  //prob not necessary to track data

  switch (command) {
    case "admin-start-scrape":
      return await runNewScrape(inputParams);

    default:
      return null;
  }
};

//check which site should be targeted
export const runNewScrape = async (inputParams) => {
  const { site } = inputParams;

  switch (site) {
    case "kcna":
      if (kcnaState.scrapeActive) {
        return { data: "ALREADY SCRAPING FAGGOT" };
      }
      return await scrapeKCNA();

    case "watch":
      return await scrapeWatch();

    default:
      return null;
  }
};

export const scrapeWatch = async () => {};
