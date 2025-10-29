const kcnaState = {
  scrapeId: null,
  intervalId: null,
  scrapeActive: false,
  schedulerActive: false,

  scrapeStartTime: null,
  scrapeEndTime: null,
  scrapeLengthSeconds: null,
  scrapeLengthMinutes: null,
  scrapeError: null,
  scrapeMessage: null,
  scrapeStep: null,
  // displayerId: null,
};

//reset after scrape turn off active
export const resetStateKCNA = async () => {
  kcnaState.scrapeActive = false;
  kcnaState.scrapeId = null;
  kcnaState.displayerId = null;
  kcnaState.scrapeStartTime = null;
  kcnaState.scrapeEndTime = null;
  kcnaState.scrapeLengthSeconds = null;
  kcnaState.scrapeLengthMinutes = null;
};

export default kcnaState;
