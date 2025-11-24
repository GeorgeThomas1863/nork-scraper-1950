const kcnaState = {
  scrapeId: null,
  scrapeActive: false,
  schedulerActive: false,

  scrapeStartTime: null,
  scrapeEndTime: null,
  scrapeLengthSeconds: null,
  scrapeLengthMinutes: null,
  scrapeError: null,
  scrapeMessage: null,
  scrapeStep: null,
};

export const resetStateKCNA = async () => {
  kcnaState.scrapeId = null;
  kcnaState.scrapeStartTime = null;
  kcnaState.scrapeEndTime = null;
  kcnaState.scrapeLengthSeconds = null;
  kcnaState.scrapeLengthMinutes = null;
  kcnaState.scrapeError = null;
  kcnaState.scrapeMessage = null;
  kcnaState.scrapeStep = null;
};

export default kcnaState;
