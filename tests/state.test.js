import { describe, it, expect, beforeEach } from 'vitest'

import kcnaState, { resetStateKCNA, buildEmptyScrapeStats } from '../src/util/state.js'

const ZERO_STATS = {
  articleURLs: 0,
  articles: 0,
  picSetURLs: 0,
  picSets: 0,
  pics: 0,
  articlesTG: 0,
  picSetsTG: 0,
}

beforeEach(() => {
  resetStateKCNA()
})

describe('buildEmptyScrapeStats', () => {
  it('returns all seven counters at zero', () => {
    expect(buildEmptyScrapeStats()).toEqual(ZERO_STATS)
  })

  it('returns a new object on every call', () => {
    expect(buildEmptyScrapeStats()).not.toBe(buildEmptyScrapeStats())
  })
})

describe('resetStateKCNA', () => {
  it('gives the initial state a zeroed scrapeStats', () => {
    expect(kcnaState.scrapeStats).toEqual(ZERO_STATS)
  })

  it('replaces a dirty scrapeStats with a fresh zeroed object', () => {
    const dirtyStats = kcnaState.scrapeStats
    dirtyStats.articles = 12
    dirtyStats.picSetsTG = 3

    resetStateKCNA()

    expect(kcnaState.scrapeStats).toEqual(ZERO_STATS)
    expect(kcnaState.scrapeStats).not.toBe(dirtyStats)
    expect(dirtyStats.articles).toBe(12)
  })

  it('does not share the scrapeStats object between consecutive resets', () => {
    const firstStats = kcnaState.scrapeStats
    resetStateKCNA()
    expect(kcnaState.scrapeStats).not.toBe(firstStats)
  })

  it('does not touch scrapeActive or schedulerActive', () => {
    kcnaState.scrapeActive = true
    kcnaState.schedulerActive = true

    resetStateKCNA()

    expect(kcnaState.scrapeActive).toBe(true)
    expect(kcnaState.schedulerActive).toBe(true)
  })
})
