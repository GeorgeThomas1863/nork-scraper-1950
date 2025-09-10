export const handleAdminCommand = async (inputParams) => {
  const { commandType } = inputParams;

  //prob not necessary to track data
  let data = "";
  switch (commandType) {
    case "admin-start-scrape":
      //ADD check to see if scrape already running
      data = await runNewScrape(inputParams);
      return data;

    default:
      return null;
  }
  console.log("API DATA");
  console.log(inputParams);
};

export const runNewScrape = async (inputParams) => {};
