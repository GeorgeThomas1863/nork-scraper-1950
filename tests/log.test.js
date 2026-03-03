import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../middleware/db-config.js', () => {
  const mockCollection = {
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }
  const mockDb = { collection: vi.fn(() => mockCollection) }
  return { dbGet: vi.fn(() => mockDb), dbConnect: vi.fn() }
})

import { dbGet } from '../middleware/db-config.js'
import kcnaState, { resetStateKCNA } from '../src/util/state.js'
import { logScrapeStartKCNA, logScrapeStopKCNA, updateLogKCNA } from '../src/util/log.js'

const getMockCollection = () => dbGet().collection()

beforeEach(() => {
  vi.clearAllMocks()
  resetStateKCNA()
  kcnaState.scrapeActive = false
  kcnaState.schedulerActive = false

  // Default find mock
  getMockCollection().find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue([]),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  })
})

// ---- updateLogKCNA ----

describe('updateLogKCNA', () => {
  it('returns null when scrapeId is not set', async () => {
    kcnaState.scrapeId = null
    const result = await updateLogKCNA()
    expect(result).toBeNull()
  })

  it('calls updateObjItem with scrapeId lookup when scrapeId is set', async () => {
    const col = getMockCollection()
    col.updateOne.mockResolvedValue({ modifiedCount: 1 })
    kcnaState.scrapeId = 'abc-123'

    const result = await updateLogKCNA()

    expect(col.updateOne).toHaveBeenCalledWith(
      { scrapeId: 'abc-123' },
      expect.objectContaining({ $set: expect.any(Object) })
    )
    expect(result.modifiedCount).toBe(1)
  })
})

// ---- logScrapeStartKCNA ----

describe('logScrapeStartKCNA', () => {
  it('resets state, sets scrapeActive true, stores log, returns kcnaState', async () => {
    const col = getMockCollection()
    const fakeInsertedId = { toString: () => 'new-scrape-id' }
    col.insertOne.mockResolvedValue({ insertedId: fakeInsertedId })
    col.updateOne.mockResolvedValue({ modifiedCount: 1 })

    // pre-dirty state
    kcnaState.scrapeId = 'old-id'
    kcnaState.scrapeStartTime = new Date(2020, 0, 1)

    const result = await logScrapeStartKCNA()

    expect(kcnaState.scrapeActive).toBe(true)
    expect(kcnaState.scrapeId).toBe('new-scrape-id')
    expect(kcnaState.scrapeStartTime).toBeInstanceOf(Date)
    expect(result).toBe(kcnaState)
    // insertOne called to create log entry
    expect(col.insertOne).toHaveBeenCalled()
  })

  it('sets scrapeStep and scrapeMessage', async () => {
    const col = getMockCollection()
    col.insertOne.mockResolvedValue({ insertedId: { toString: () => 'id' } })
    col.updateOne.mockResolvedValue({})

    await logScrapeStartKCNA()

    expect(kcnaState.scrapeStep).toBe('ARTICLE URLS KCNA')
    expect(kcnaState.scrapeMessage).toBe('STARTING NEW SCRAPE KCNA')
  })
})

// ---- logScrapeStopKCNA ----

describe('logScrapeStopKCNA', () => {
  it('sets scrapeActive false immediately when no scrapeStartTime', async () => {
    kcnaState.scrapeStartTime = null
    kcnaState.scrapeActive = true

    const result = await logScrapeStopKCNA()

    expect(result.scrapeActive).toBe(false)
    expect(kcnaState.scrapeActive).toBe(false)
  })

  it('calculates scrape length and finalizes state when scrapeStartTime is set', async () => {
    const col = getMockCollection()
    col.updateOne.mockResolvedValue({ modifiedCount: 1 })

    const start = new Date(Date.now() - 5000) // 5 seconds ago
    kcnaState.scrapeStartTime = start
    kcnaState.scrapeId = 'test-id'
    kcnaState.scrapeActive = true

    const result = await logScrapeStopKCNA()

    expect(result.scrapeLengthSeconds).toBeGreaterThanOrEqual(4)
    expect(result.scrapeStep).toBe('FINISHED SCRAPE KCNA')
    expect(result.scrapeMessage).toBe('FINISHED SCRAPE KCNA')
    expect(result.scrapeActive).toBe(false)
  })

  it('resets state after stop and returns a snapshot', async () => {
    const col = getMockCollection()
    col.updateOne.mockResolvedValue({})

    kcnaState.scrapeStartTime = new Date(Date.now() - 1000)
    kcnaState.scrapeId = 'test-id'

    const result = await logScrapeStopKCNA()

    // state is reset after stop
    expect(kcnaState.scrapeId).toBeNull()
    // but result captured the final state
    expect(result.scrapeId).toBe('test-id')
  })
})
