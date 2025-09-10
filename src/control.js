export const handleAdminCommand = async (inputParams) => {
  const { commandType } = inputParams;

  console.log("API DATA");
  console.log(inputParams);

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
};

export const runNewScrape = async (inputParams) => {};
