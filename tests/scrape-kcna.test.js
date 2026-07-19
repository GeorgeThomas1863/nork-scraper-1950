import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/util/log.js', () => ({
  logScrapeStartKCNA: vi.fn(),
  logScrapeStopKCNA: vi.fn(),
}))

vi.mock('../src/util/util.js', () => ({
  calcHowMuchKCNA: vi.fn(),
}))

vi.mock('../src/kcna/articles.js', () => ({
  scrapeArticleURLsKCNA: vi.fn(),
  scrapeArticleContentKCNA: vi.fn(),
  uploadArticlesKCNA: vi.fn(),
}))

vi.mock('../src/kcna/picSets.js', () => ({
  scrapePicSetURLsKCNA: vi.fn(),
  scrapePicSetContentKCNA: vi.fn(),
  uploadPicSetsKCNA: vi.fn(),
}))

vi.mock('../src/kcna/pics.js', () => ({
  downloadPicsKCNA: vi.fn(),
}))

vi.mock('../src/util/update-db.js', () => ({
  updatePicDataKCNA: vi.fn(),
}))

import { scrapeKCNA } from '../src/kcna/scrape-kcna.js'
import { logScrapeStartKCNA, logScrapeStopKCNA } from '../src/util/log.js'
import { calcHowMuchKCNA } from '../src/util/util.js'
import kcnaState, { resetStateKCNA } from '../src/util/state.js'
import { scrapeArticleURLsKCNA, scrapeArticleContentKCNA, uploadArticlesKCNA } from '../src/kcna/articles.js'
import { scrapePicSetURLsKCNA, scrapePicSetContentKCNA, uploadPicSetsKCNA } from '../src/kcna/picSets.js'
import { downloadPicsKCNA } from '../src/kcna/pics.js'
import { updatePicDataKCNA } from '../src/util/update-db.js'

beforeEach(() => {
  vi.resetAllMocks()
  resetStateKCNA()
  kcnaState.scrapeActive = true
  logScrapeStartKCNA.mockResolvedValue({ scrapeStep: 'ARTICLE URLS KCNA' })
  logScrapeStopKCNA.mockResolvedValue({ scrapeActive: false })
  calcHowMuchKCNA
    .mockResolvedValueOnce(['article-page'])
    .mockResolvedValueOnce(['pic-set-page'])
})

describe('scrapeKCNA', () => {
  it('owns the invocation until finalization completes', async () => {
    let finishStart
    logScrapeStartKCNA.mockImplementationOnce(() => new Promise((resolve) => {
      finishStart = resolve
    }))

    const scrapePromise = scrapeKCNA({ howMuch: 'admin-scrape-new' })

    expect(kcnaState.scrapeRunning).toBe(true)
    finishStart({ scrapeStep: 'ARTICLE URLS KCNA' })
    await scrapePromise
    expect(kcnaState.scrapeRunning).toBe(false)
  })

  it('finalizes once and returns final state after success', async () => {
    const finalState = { scrapeActive: false, scrapeMessage: 'FINISHED SCRAPE KCNA' }
    logScrapeStopKCNA.mockResolvedValue(finalState)

    const result = await scrapeKCNA({ howMuch: 'admin-scrape-new' })

    expect(logScrapeStopKCNA).toHaveBeenCalledTimes(1)
    expect(logScrapeStopKCNA).toHaveBeenCalledWith()
    expect(kcnaState.scrapeRunning).toBe(false)
    expect(result.scrapeRunning).toBe(false)
    expect(result).toBe(finalState)
  })

  it('does not retry finalization when success-state logging fails', async () => {
    const loggingError = new Error('log write failed')
    logScrapeStopKCNA.mockRejectedValue(loggingError)

    await expect(scrapeKCNA({ howMuch: 'admin-scrape-new' })).rejects.toBe(loggingError)

    expect(logScrapeStopKCNA).toHaveBeenCalledTimes(1)
  })

  it('preserves the pipeline error when failure finalization also rejects', async () => {
    const pipelineError = new Error('article lookup failed')
    const loggingError = new Error('failure log write failed')
    scrapeArticleURLsKCNA.mockRejectedValue(pipelineError)
    logScrapeStopKCNA.mockRejectedValue(loggingError)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(scrapeKCNA({ howMuch: 'admin-scrape-new' })).rejects.toBe(pipelineError)

    expect(pipelineError.apiMessage).toBe('Scrape failed during ARTICLE URLS KCNA')
    expect(kcnaState.scrapeActive).toBe(false)
    expect(logScrapeStopKCNA).toHaveBeenCalledTimes(1)
    expect(consoleSpy).toHaveBeenCalledWith('SCRAPE FINALIZATION ERROR: failure log write failed')
    consoleSpy.mockRestore()
  })

  it('identifies the picture-set URL stage when it fails', async () => {
    const pipelineError = new Error('picture-set lookup failed')
    scrapePicSetURLsKCNA.mockRejectedValue(pipelineError)
    logScrapeStopKCNA.mockImplementation(async () => ({
      scrapeMessage: `Scrape failed during ${kcnaState.scrapeStep}`,
    }))
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(scrapeKCNA({ howMuch: 'admin-scrape-new' })).rejects.toBe(pipelineError)

    expect(pipelineError.apiMessage).toBe('Scrape failed during PIC SET URLS KCNA')
    consoleSpy.mockRestore()
  })

  it('sets accurate stages before calculation, content, media, and upload operations', async () => {
    const observedSteps = []
    calcHowMuchKCNA.mockImplementation(async () => {
      observedSteps.push(kcnaState.scrapeStep)
      return ['page']
    })

    scrapeArticleURLsKCNA.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))
    scrapePicSetURLsKCNA.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))
    scrapeArticleContentKCNA.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))
    scrapePicSetContentKCNA.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))
    downloadPicsKCNA.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))
    updatePicDataKCNA.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))
    uploadArticlesKCNA.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))
    uploadPicSetsKCNA.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))

    await scrapeKCNA({ howMuch: 'admin-scrape-new' })

    expect(observedSteps).toEqual([
      'ARTICLE URLS KCNA',
      'PIC SET URLS KCNA',
      'ARTICLE CONTENT KCNA',
      'PIC SET CONTENT KCNA',
      'PIC DOWNLOAD KCNA',
      'PIC DATA UPDATE KCNA',
      'ARTICLE UPLOAD KCNA',
      'PIC SET UPLOAD KCNA',
    ])
  })

  it('records the pipeline error, finalizes once, and rethrows it', async () => {
    const pipelineError = new Error('database connection failed')
    const failedState = { scrapeMessage: 'Scrape failed during ARTICLE URLS KCNA' }
    scrapeArticleURLsKCNA.mockRejectedValue(pipelineError)
    logScrapeStopKCNA.mockResolvedValue(failedState)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    let thrownError
    try {
      await scrapeKCNA({ howMuch: 'admin-scrape-new' })
    } catch (error) {
      thrownError = error
    }

    expect(logScrapeStopKCNA).toHaveBeenCalledTimes(1)
    expect(logScrapeStopKCNA).toHaveBeenCalledWith(pipelineError)
    expect(thrownError).toBe(pipelineError)
    expect(thrownError.apiMessage).toBe('Scrape failed during ARTICLE URLS KCNA')
    expect(consoleSpy).toHaveBeenCalledWith('SCRAPE ERROR: database connection failed')
    consoleSpy.mockRestore()
  })
})
