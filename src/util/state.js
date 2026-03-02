const RESET_STATE = {
  scrapeId: null,
  scrapeStartTime: null,
  scrapeEndTime: null,
  scrapeLengthSeconds: null,
  scrapeLengthMinutes: null,
  scrapeError: null,
  scrapeMessage: null,
  scrapeStep: null,
};

const kcnaState = {
  scrapeActive: false,
  schedulerActive: false,
  ...RESET_STATE,
};

export const resetStateKCNA = () => Object.assign(kcnaState, RESET_STATE);

export default kcnaState;
