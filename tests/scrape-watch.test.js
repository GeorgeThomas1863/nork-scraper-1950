import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/util/log.js', () => ({
  logScrapeStartKCNA: vi.fn(),
  logScrapeStopKCNA: vi.fn(),
}))

vi.mock('../src/watch/kctv-listing.js', () => ({
  WATCH_VID_TYPES: ['news5pm', 'news8pm'],
  scrapeKctvListing: vi.fn(),
}))

vi.mock('../src/watch/vids.js', () => ({
  uploadVidPagesWatch: vi.fn(),
  downloadVidsWatch: vi.fn(),
}))

import { scrapeWatch } from '../src/watch/scrape-watch.js'
import { logScrapeStartKCNA, logScrapeStopKCNA } from '../src/util/log.js'
import { scrapeKctvListing } from '../src/watch/kctv-listing.js'
import { uploadVidPagesWatch, downloadVidsWatch } from '../src/watch/vids.js'
import kcnaState, { resetStateKCNA } from '../src/util/state.js'

const inputParams = { command: 'admin-start-scrape', site: 'watch', howMuch: 'admin-scrape-new' }

beforeEach(() => {
  vi.resetAllMocks()
  resetStateKCNA()
  kcnaState.scrapeActive = true
  kcnaState.scrapeRunning = false
  logScrapeStartKCNA.mockResolvedValue({ scrapeStep: 'ARTICLE URLS KCNA' })
  logScrapeStopKCNA.mockResolvedValue({ scrapeActive: false })
  scrapeKctvListing.mockResolvedValue([])
  uploadVidPagesWatch.mockResolvedValue(0)
  downloadVidsWatch.mockResolvedValue(0)
})

describe('scrapeWatch', () => {
  it('runs the listing, upload, and download stages in order', async () => {
    const observedSteps = []
    scrapeKctvListing.mockImplementation(async () => {
      observedSteps.push(kcnaState.scrapeStep)
      return []
    })
    uploadVidPagesWatch.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))
    downloadVidsWatch.mockImplementation(async () => observedSteps.push(kcnaState.scrapeStep))

    await scrapeWatch(inputParams)

    expect(observedSteps).toEqual(['KCTV LISTING WATCH', 'KCTV UPLOAD WATCH', 'KCTV DOWNLOAD WATCH'])
  })

  it('passes inputParams to the listing scrape and its entries to the upload', async () => {
    const entryArray = [{ vidType: 'news5pm' }, { vidType: 'news8pm' }]
    scrapeKctvListing.mockResolvedValue(entryArray)

    await scrapeWatch(inputParams)

    expect(scrapeKctvListing).toHaveBeenCalledWith(inputParams)
    expect(uploadVidPagesWatch).toHaveBeenCalledWith(entryArray)
    expect(downloadVidsWatch).toHaveBeenCalledWith()
  })

  it('finalizes once and returns the final state after success', async () => {
    const finalState = { scrapeActive: false, scrapeMessage: 'FINISHED SCRAPE KCNA' }
    logScrapeStopKCNA.mockResolvedValue(finalState)

    const result = await scrapeWatch(inputParams)

    expect(logScrapeStartKCNA).toHaveBeenCalledTimes(1)
    expect(logScrapeStopKCNA).toHaveBeenCalledTimes(1)
    expect(logScrapeStopKCNA).toHaveBeenCalledWith()
    expect(result).toBe(finalState)
    expect(result.scrapeRunning).toBe(false)
  })

  it('refuses to start a second invocation while one is already running', async () => {
    kcnaState.scrapeRunning = true

    const result = await scrapeWatch(inputParams)

    expect(logScrapeStartKCNA).not.toHaveBeenCalled()
    expect(scrapeKctvListing).not.toHaveBeenCalled()
    expect(result).toBe(kcnaState)
  })

  it('owns the invocation until finalization completes', async () => {
    let finishListing
    scrapeKctvListing.mockImplementation(() => new Promise((resolve) => {
      finishListing = resolve
    }))

    const scrapePromise = scrapeWatch(inputParams)
    await Promise.resolve()

    expect(kcnaState.scrapeRunning).toBe(true)
    finishListing([])
    await scrapePromise
    expect(kcnaState.scrapeRunning).toBe(false)
  })

  it('records a listing failure, finalizes once, and rethrows it', async () => {
    const pipelineError = new Error('kctv listing failed')
    scrapeKctvListing.mockRejectedValue(pipelineError)
    logScrapeStopKCNA.mockResolvedValue({ scrapeMessage: 'Scrape failed during KCTV LISTING WATCH' })
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(scrapeWatch(inputParams)).rejects.toBe(pipelineError)

    expect(logScrapeStopKCNA).toHaveBeenCalledTimes(1)
    expect(logScrapeStopKCNA).toHaveBeenCalledWith(pipelineError)
    expect(pipelineError.apiMessage).toBe('Scrape failed during KCTV LISTING WATCH')
    expect(uploadVidPagesWatch).not.toHaveBeenCalled()
    expect(downloadVidsWatch).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('identifies the download stage when it fails', async () => {
    const pipelineError = new Error('vid download failed')
    downloadVidsWatch.mockRejectedValue(pipelineError)
    logScrapeStopKCNA.mockResolvedValue({})
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(scrapeWatch(inputParams)).rejects.toBe(pipelineError)

    expect(pipelineError.apiMessage).toBe('Scrape failed during KCTV DOWNLOAD WATCH')
    expect(kcnaState.scrapeActive).toBe(false)
    consoleSpy.mockRestore()
  })

  it('resets scrapeRunning when the pipeline throws', async () => {
    scrapeKctvListing.mockRejectedValue(new Error('kctv listing failed'))
    logScrapeStopKCNA.mockResolvedValue({})
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await expect(scrapeWatch(inputParams)).rejects.toThrow('kctv listing failed')

    expect(kcnaState.scrapeRunning).toBe(false)
    consoleSpy.mockRestore()
  })
})
