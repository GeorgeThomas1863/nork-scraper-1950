const buildResetState = () => ({
  scrapeId: null,
  scrapeStartTime: null,
  scrapeEndTime: null,
  scrapeLengthSeconds: null,
  scrapeLengthMinutes: null,
  scrapeError: null,
  scrapeMessage: null,
  scrapeStep: null,
});

const kcnaState = {
  scrapeActive: false,
  scrapeRunning: false,
  schedulerActive: false,
  ...buildResetState(),
};

export const resetStateKCNA = () => Object.assign(kcnaState, buildResetState());

export default kcnaState;
