import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/kcna/scrape-kcna.js', () => ({
  scrapeKCNA: vi.fn(),
}))

vi.mock('../src/util/scheduler.js', () => ({
  startSchedulerKCNA: vi.fn(),
  stopSchedulerKCNA: vi.fn(),
}))

vi.mock('../src/util/log.js', () => ({
  logScrapeStopKCNA: vi.fn(),
  logScrapeStartKCNA: vi.fn(),
  updateLogKCNA: vi.fn(),
}))

import kcnaState from '../src/util/state.js'
import { runScraper } from '../src/src.js'
import { scrapeKCNA } from '../src/kcna/scrape-kcna.js'
import { startSchedulerKCNA, stopSchedulerKCNA } from '../src/util/scheduler.js'
import { logScrapeStopKCNA } from '../src/util/log.js'

beforeEach(() => {
  vi.clearAllMocks()
  kcnaState.scrapeActive = false
  kcnaState.scrapeRunning = false
  kcnaState.schedulerActive = false
  kcnaState.scrapeMessage = null
})

describe('runScraper', () => {
  // ---- admin-scrape-status ----

  it('returns current kcnaState for admin-scrape-status', async () => {
    kcnaState.scrapeActive = false
    kcnaState.scrapeMessage = 'idle'
    const result = await runScraper({ command: 'admin-scrape-status' })
    expect(result).toBe(kcnaState)
  })

  // ---- admin-start-scrape ----

  it('calls scrapeKCNA when scrapeActive is false', async () => {
    scrapeKCNA.mockResolvedValue({ scrapeActive: false })
    const result = await runScraper({ command: 'admin-start-scrape', howMuch: 'admin-scrape-new' })
    expect(scrapeKCNA).toHaveBeenCalledWith({ command: 'admin-start-scrape', howMuch: 'admin-scrape-new' })
  })

  it('returns state with message when scrape already active', async () => {
    kcnaState.scrapeActive = true
    kcnaState.scrapeRunning = true
    const result = await runScraper({ command: 'admin-start-scrape' })
    expect(scrapeKCNA).not.toHaveBeenCalled()
    expect(result.scrapeMessage).toBe('Scrape already in progress')
  })

  // ---- admin-stop-scrape ----

  it('requests active scrape cancellation without finalizing it', async () => {
    kcnaState.scrapeActive = true

    const result = await runScraper({ command: 'admin-stop-scrape' })

    expect(result).toBe(kcnaState)
    expect(kcnaState.scrapeActive).toBe(false)
    expect(kcnaState.scrapeMessage).toBe('STOPPING SCRAPE KCNA')
    expect(logScrapeStopKCNA).not.toHaveBeenCalled()
  })

  it('rejects a new scrape until a cancelled invocation finishes finalizing', async () => {
    kcnaState.scrapeActive = true
    kcnaState.scrapeRunning = true

    await runScraper({ command: 'admin-stop-scrape' })
    const result = await runScraper({ command: 'admin-start-scrape', howMuch: 'admin-scrape-new' })

    expect(scrapeKCNA).not.toHaveBeenCalled()
    expect(result.scrapeMessage).toBe('Scrape cancellation is still finalizing')
  })

  it('returns state with message when no scrape in progress', async () => {
    kcnaState.scrapeActive = false
    const result = await runScraper({ command: 'admin-stop-scrape' })
    expect(logScrapeStopKCNA).not.toHaveBeenCalled()
    expect(result.scrapeMessage).toBe('No scrape in progress')
  })

  // ---- admin-start-scheduler ----

  it('calls startSchedulerKCNA when scheduler not already running', async () => {
    kcnaState.schedulerActive = false
    startSchedulerKCNA.mockResolvedValue(true)

    const result = await runScraper({ command: 'admin-start-scheduler' })

    expect(startSchedulerKCNA).toHaveBeenCalled()
    expect(result).toBe(kcnaState)
  })

  it('returns state with message when scheduler already running', async () => {
    kcnaState.schedulerActive = true
    const result = await runScraper({ command: 'admin-start-scheduler' })
    expect(startSchedulerKCNA).not.toHaveBeenCalled()
    expect(result.scrapeMessage).toBe('Scheduler already running')
  })

  // ---- admin-stop-scheduler ----

  it('calls stopSchedulerKCNA when scheduler is running', async () => {
    kcnaState.schedulerActive = true
    stopSchedulerKCNA.mockResolvedValue(true)

    const result = await runScraper({ command: 'admin-stop-scheduler' })

    expect(stopSchedulerKCNA).toHaveBeenCalled()
    expect(result).toBe(kcnaState)
  })

  it('returns state with message when scheduler is not running', async () => {
    kcnaState.schedulerActive = false
    const result = await runScraper({ command: 'admin-stop-scheduler' })
    expect(stopSchedulerKCNA).not.toHaveBeenCalled()
    expect(result.scrapeMessage).toBe('Scheduler is not running')
  })

  // ---- unknown command ----

  it('returns null for unknown command', async () => {
    const result = await runScraper({ command: 'unknown-command' })
    expect(result).toBeNull()
  })
})
