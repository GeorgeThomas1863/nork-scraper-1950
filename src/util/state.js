export const buildEmptyScrapeStats = () => ({
  articleURLs: 0,
  articles: 0,
  picSetURLs: 0,
  picSets: 0,
  pics: 0,
  articlesTG: 0,
  picSetsTG: 0,
});

const buildResetState = () => ({
  scrapeId: null,
  scrapeStartTime: null,
  scrapeEndTime: null,
  scrapeLengthSeconds: null,
  scrapeLengthMinutes: null,
  scrapeError: null,
  scrapeMessage: null,
  scrapeStep: null,
  scrapeStats: buildEmptyScrapeStats(),
});

const kcnaState = {
  scrapeActive: false,
  scrapeRunning: false,
  schedulerActive: false,
  ...buildResetState(),
};

export const resetStateKCNA = () => Object.assign(kcnaState, buildResetState());

export default kcnaState;
