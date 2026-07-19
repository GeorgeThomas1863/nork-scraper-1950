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
  kcnaState.scrapeRunning = false
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

  it('does not install an interval after being stopped during the initial scrape', async () => {
    let finishInitialScrape
    scrapeKCNA.mockImplementationOnce(() => new Promise((resolve) => {
      finishInitialScrape = resolve
    }))

    const startPromise = startSchedulerKCNA()
    await vi.waitFor(() => expect(scrapeKCNA).toHaveBeenCalledTimes(1))

    const stopResult = await stopSchedulerKCNA()
    finishInitialScrape({})
    const startResult = await startPromise

    expect(stopResult).toBe(true)
    expect(startResult).toBeNull()
    expect(kcnaState.schedulerActive).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not let an old initial scrape overwrite a restarted scheduler interval', async () => {
    let finishOldScrape
    scrapeKCNA
      .mockImplementationOnce(() => new Promise((resolve) => {
        finishOldScrape = resolve
      }))
      .mockResolvedValueOnce({})

    const oldStartPromise = startSchedulerKCNA()
    await vi.waitFor(() => expect(scrapeKCNA).toHaveBeenCalledTimes(1))
    await stopSchedulerKCNA()

    const restartedResult = await startSchedulerKCNA()
    expect(restartedResult).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    finishOldScrape({})
    expect(await oldStartPromise).toBeNull()
    expect(kcnaState.schedulerActive).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    vi.clearAllMocks()
    await vi.advanceTimersByTimeAsync(3600000)
    expect(scrapeKCNA).toHaveBeenCalledTimes(1)
  })

  it('rolls back its ownership when the initial scrape rejects and allows restart', async () => {
    scrapeKCNA.mockRejectedValueOnce(new Error('initial scrape failed'))

    await expect(startSchedulerKCNA()).rejects.toThrow('initial scrape failed')

    expect(kcnaState.schedulerActive).toBe(false)
    expect(vi.getTimerCount()).toBe(0)

    scrapeKCNA.mockResolvedValueOnce({})
    expect(await startSchedulerKCNA()).toBe(true)
    expect(kcnaState.schedulerActive).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('does not let an old initial rejection deactivate a restarted scheduler', async () => {
    let rejectOldScrape
    scrapeKCNA
      .mockImplementationOnce(() => new Promise((resolve, reject) => {
        rejectOldScrape = reject
      }))
      .mockResolvedValueOnce({})

    const oldStartPromise = startSchedulerKCNA()
    await vi.waitFor(() => expect(scrapeKCNA).toHaveBeenCalledTimes(1))
    await stopSchedulerKCNA()
    await startSchedulerKCNA()

    rejectOldScrape(new Error('old scrape failed'))
    await expect(oldStartPromise).rejects.toThrow('old scrape failed')

    expect(kcnaState.schedulerActive).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('catches and logs scheduled scrape rejections', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await startSchedulerKCNA()
    scrapeKCNA.mockRejectedValueOnce(new Error('scheduled scrape failed'))

    await vi.advanceTimersByTimeAsync(3600000)

    expect(consoleSpy).toHaveBeenCalledWith('SCHEDULED SCRAPE ERROR: scheduled scrape failed')
    consoleSpy.mockRestore()
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
