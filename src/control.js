import { scrapeArticlesKCNA } from "./kcna/articles.js";
import { scrapePicsKCNA } from "./kcna/pics.js";
import { scrapeVidsKCNA } from "./kcna/vids.js";

import { uploadTG } from "./tg/upload.js";

export const handleAdminCommand = async (inputParams) => {
  const { command } = inputParams;

  console.log("API DATA");
  console.log(inputParams);

  //prob not necessary to track data

  switch (command) {
    case "admin-start-scrape":
      //ADD check to see if scrape already running
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
      return await scrapeKCNA();

    case "watch":
      return await scrapeWatch();

    default:
      return null;
  }
};

export const scrapeKCNA = async () => {
  await scrapeArticlesKCNA();
  await scrapePicsKCNA();
  await scrapeVidsKCNA();

  //upload to TG
  await uploadTG();
};

export const scrapeWatch = async () => {};
