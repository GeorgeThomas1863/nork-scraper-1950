import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../src/kcna/scrape-kcna.js', () => ({
  scrapeKCNA: vi.fn().mockResolvedValue({}),
}))

import kcnaState, { resetStateKCNA } from '../src/util/state.js'
import { startSchedulerKCNA, stopSchedulerKCNA } from '../src/util/scheduler.js'
import { scrapeKCNA } from '../src/kcna/scrape-kcna.js'

beforeEach(() => {
  resetStateKCNA()
  kcnaState.scrapeActive = false
  kcnaState.schedulerActive = false
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(async () => {
  await stopSchedulerKCNA()
  vi.useRealTimers()
})

describe('startSchedulerKCNA', () => {
  it('sets schedulerActive to true', async () => {
    await startSchedulerKCNA()
    expect(kcnaState.schedulerActive).toBe(true)
  })

  it('returns true', async () => {
    const result = await startSchedulerKCNA()
    expect(result).toBe(true)
  })

  it('runs an immediate scrape when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false
    await startSchedulerKCNA()
    expect(scrapeKCNA).toHaveBeenCalledWith({ howMuch: 'admin-scrape-new' })
  })

  it('skips the immediate scrape when scrapeActive is already true', async () => {
    kcnaState.scrapeActive = true
    await startSchedulerKCNA()
    expect(scrapeKCNA).not.toHaveBeenCalled()
  })

  it('triggers another scrape after SCRAPE_INTERVAL elapses', async () => {
    await startSchedulerKCNA()
    vi.clearAllMocks() // clear the initial immediate scrape call
    await vi.advanceTimersByTimeAsync(3600000)
    expect(scrapeKCNA).toHaveBeenCalledWith({ howMuch: 'admin-scrape-new' })
  })
})

describe('stopSchedulerKCNA', () => {
  it('returns null when scheduler is not running', async () => {
    const result = await stopSchedulerKCNA()
    expect(result).toBeNull()
  })

  it('returns true after stopping a running scheduler', async () => {
    await startSchedulerKCNA()
    const result = await stopSchedulerKCNA()
    expect(result).toBe(true)
  })

  it('sets schedulerActive to false', async () => {
    await startSchedulerKCNA()
    expect(kcnaState.schedulerActive).toBe(true)
    await stopSchedulerKCNA()
    expect(kcnaState.schedulerActive).toBe(false)
  })

  it('prevents further interval scrapes after stopping', async () => {
    await startSchedulerKCNA()
    await stopSchedulerKCNA()
    vi.clearAllMocks()
    await vi.advanceTimersByTimeAsync(3600000 * 3)
    expect(scrapeKCNA).not.toHaveBeenCalled()
  })
})
