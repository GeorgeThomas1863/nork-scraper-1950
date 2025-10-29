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

  //watchdog
  lastUpdateTime: null,
  watchdogIntervalId: null,
  isFucked: false,
};

//reset after scrape turn off active
export const resetStateKCNA = async () => {
  kcnaState.scrapeId = null;
  kcnaState.scrapeActive = false;
  // kcnaState.displayerId = null;
  kcnaState.scrapeStartTime = null;
  kcnaState.scrapeEndTime = null;
  kcnaState.scrapeLengthSeconds = null;
  kcnaState.scrapeLengthMinutes = null;
  kcnaState.scrapeError = null;
  kcnaState.scrapeMessage = null;
  kcnaState.scrapeStep = null;
  kcnaState.watchdogIntervalId = null;
  kcnaState.lastUpdateTime = null;
  kcnaState.isFucked = false;
};

export default kcnaState;
