import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../src/kcna/scrape-kcna.js', () => ({
  scrapeKCNA: vi.fn().mockResolvedValue({}),
}))

// Mock dbModel at class level — intercept every `new dbModel(...)` call
const mockGetUniqueItem = vi.fn()
const mockStoreAny = vi.fn()
const mockUpdateObjItem = vi.fn()

vi.mock('../models/db-model.js', () => ({
  default: vi.fn().mockImplementation(function (dataObject, collection) {
    this.dataObject = dataObject
    this.collection = collection
    this.getUniqueItem = mockGetUniqueItem
    this.storeAny = mockStoreAny
    this.updateObjItem = mockUpdateObjItem
  }),
}))

import kcnaState, { resetStateKCNA } from '../src/util/state.js'
import { startSchedulerKCNA, stopSchedulerKCNA, resumeSchedulerKCNA } from '../src/util/scheduler.js'
import { scrapeKCNA } from '../src/kcna/scrape-kcna.js'
import dbModel from '../models/db-model.js'

const SCHEDULER_DOC = { configKey: 'schedulerState', schedulerOn: true }

beforeEach(() => {
  resetStateKCNA()
  kcnaState.scrapeActive = false
  kcnaState.scrapeRunning = false
  kcnaState.schedulerActive = false
  vi.clearAllMocks()
  vi.useFakeTimers()

  mockGetUniqueItem.mockResolvedValue(null)
  mockStoreAny.mockResolvedValue({ insertedId: 'config-id' })
  mockUpdateObjItem.mockResolvedValue({ modifiedCount: 1 })
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

  it('returns before the initial scrape resolves', async () => {
    scrapeKCNA.mockImplementationOnce(() => new Promise(() => {})) // never resolves

    const result = await startSchedulerKCNA()

    expect(result).toBe(true)
    expect(scrapeKCNA).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('keeps the interval alive when the initial scrape rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    scrapeKCNA.mockRejectedValueOnce(new Error('initial scrape failed'))

    const result = await startSchedulerKCNA()
    await vi.advanceTimersByTimeAsync(0) // flush the rejection handler

    expect(result).toBe(true)
    expect(kcnaState.schedulerActive).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    expect(consoleSpy).toHaveBeenCalledWith('INITIAL SCRAPE ERROR: initial scrape failed')
    consoleSpy.mockRestore()
  })

  it('retries on the next tick after the initial scrape rejects', async () => {
    scrapeKCNA.mockRejectedValueOnce(new Error('initial scrape failed'))

    await startSchedulerKCNA()
    await vi.advanceTimersByTimeAsync(0)
    vi.clearAllMocks()
    await vi.advanceTimersByTimeAsync(3600000)

    expect(scrapeKCNA).toHaveBeenCalledWith({ howMuch: 'admin-scrape-new' })
  })

  it('leaves exactly one interval after a stop and restart', async () => {
    await startSchedulerKCNA()
    await stopSchedulerKCNA()

    const restartResult = await startSchedulerKCNA()

    expect(restartResult).toBe(true)
    expect(vi.getTimerCount()).toBe(1)

    vi.clearAllMocks()
    await vi.advanceTimersByTimeAsync(3600000)
    expect(scrapeKCNA).toHaveBeenCalledTimes(1)
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

  it('clears the interval and persists off when stopped during the initial scrape', async () => {
    mockGetUniqueItem.mockResolvedValue(SCHEDULER_DOC)
    scrapeKCNA.mockImplementationOnce(() => new Promise(() => {})) // still running

    await startSchedulerKCNA()
    expect(vi.getTimerCount()).toBe(1)

    const stopResult = await stopSchedulerKCNA()

    expect(stopResult).toBe(true)
    expect(kcnaState.schedulerActive).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(dbModel).toHaveBeenCalledWith(
      expect.objectContaining({ updateObj: expect.objectContaining({ schedulerOn: false }) }),
      'scrapeLog'
    )
  })
})

describe('scheduler state persistence', () => {
  it('stores a new config doc with schedulerOn true when none exists', async () => {
    mockGetUniqueItem.mockResolvedValue(null)

    await startSchedulerKCNA()

    expect(dbModel).toHaveBeenCalledWith(
      { configKey: 'schedulerState', schedulerOn: true, updatedAt: expect.any(Date) },
      'scrapeLog'
    )
    expect(mockStoreAny).toHaveBeenCalled()
    expect(mockUpdateObjItem).not.toHaveBeenCalled()
  })

  it('updates the existing config doc instead of storing a duplicate', async () => {
    mockGetUniqueItem.mockResolvedValue({ ...SCHEDULER_DOC, schedulerOn: false })

    await startSchedulerKCNA()

    expect(mockStoreAny).not.toHaveBeenCalled()
    expect(dbModel).toHaveBeenCalledWith(
      {
        keyToLookup: 'configKey',
        itemValue: 'schedulerState',
        updateObj: { schedulerOn: true, updatedAt: expect.any(Date) },
      },
      'scrapeLog'
    )
    expect(mockUpdateObjItem).toHaveBeenCalled()
  })

  it('persists schedulerOn false when the scheduler stops', async () => {
    await startSchedulerKCNA()
    mockGetUniqueItem.mockResolvedValue(SCHEDULER_DOC)
    vi.clearAllMocks()

    await stopSchedulerKCNA()

    expect(dbModel).toHaveBeenCalledWith(
      expect.objectContaining({
        updateObj: { schedulerOn: false, updatedAt: expect.any(Date) },
      }),
      'scrapeLog'
    )
  })

  it('starts the scheduler even when persistence throws', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockGetUniqueItem.mockRejectedValue(new Error('mongo down'))

    const result = await startSchedulerKCNA()

    expect(result).toBe(true)
    expect(kcnaState.schedulerActive).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
    expect(consoleSpy).toHaveBeenCalledWith('SCHEDULER STATE PERSIST ERROR: mongo down')
    consoleSpy.mockRestore()
  })

  it('stops the scheduler even when persistence throws', async () => {
    await startSchedulerKCNA()
    mockGetUniqueItem.mockRejectedValue(new Error('mongo down'))

    const result = await stopSchedulerKCNA()

    expect(result).toBe(true)
    expect(kcnaState.schedulerActive).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reads and writes the scheduler config in LOG_COLLECTION only', async () => {
    await startSchedulerKCNA()

    const collections = dbModel.mock.calls.map((call) => call[1])
    for (const collection of collections) {
      expect(collection).toBe('scrapeLog')
    }
  })
})

describe('resumeSchedulerKCNA', () => {
  it('starts the scheduler when the saved state is on', async () => {
    mockGetUniqueItem.mockResolvedValue(SCHEDULER_DOC)

    const result = await resumeSchedulerKCNA()

    expect(result).toBe(true)
    expect(kcnaState.schedulerActive).toBe(true)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('does not start the scheduler when the saved state is off', async () => {
    mockGetUniqueItem.mockResolvedValue({ ...SCHEDULER_DOC, schedulerOn: false })

    const result = await resumeSchedulerKCNA()

    expect(result).toBeNull()
    expect(kcnaState.schedulerActive).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(scrapeKCNA).not.toHaveBeenCalled()
  })

  it('does not start the scheduler when no config doc exists', async () => {
    mockGetUniqueItem.mockResolvedValue(null)

    const result = await resumeSchedulerKCNA()

    expect(result).toBeNull()
    expect(kcnaState.schedulerActive).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(scrapeKCNA).not.toHaveBeenCalled()
  })

  it('logs and does not start the scheduler when the state read throws', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    mockGetUniqueItem.mockRejectedValue(new Error('mongo down'))

    const result = await resumeSchedulerKCNA()

    expect(result).toBeNull()
    expect(kcnaState.schedulerActive).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(consoleSpy).toHaveBeenCalledWith('SCHEDULER STATE READ ERROR: mongo down')
    consoleSpy.mockRestore()
  })
})
