import { describe, it, expect, vi, beforeEach } from 'vitest'

// Bug 4: when the gallery LIST page has no date element, parsePicSetContent
// used to hand a null date straight to extractPicSetPicArray, whose first
// line (`if (!document || !date) return null;`) silently threw the whole
// detail page away with no log. These tests cover the detail-page date
// recovery + scrapeStartTime fallback added to fix that.

const { mockCollection, mockHTMLByURL } = vi.hoisted(() => ({
  mockHTMLByURL: new Map(),
  mockCollection: {
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}))

vi.mock('../middleware/db-config.js', () => {
  const mockDb = { collection: vi.fn(() => mockCollection) }
  return { dbGet: vi.fn(() => mockDb), dbConnect: vi.fn() }
})

vi.mock('../src/tg-api.js', () => ({
  tgSendMessage: vi.fn(),
  tgPostPicFS: vi.fn(),
}))

vi.mock('../src/kcna/pics.js', () => ({
  postPicArrayTG: vi.fn(),
}))

vi.mock('../src/util/log.js', () => ({
  updateLogKCNA: vi.fn(),
}))

vi.mock('../models/nork-model.js', () => ({
  default: vi.fn().mockImplementation(function MockNORK({ url }) {
    this.getHTML = vi.fn().mockImplementation(async () => mockHTMLByURL.get(url) ?? null)
  }),
}))

import kcnaState from '../src/util/state.js'
import { parsePicSetContent } from '../src/kcna/picSets.js'
import { noDateGalleryDetailHTML } from './fixtures/kcna-picset-quirks.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockHTMLByURL.clear()
  kcnaState.scrapeActive = true
  kcnaState.scrapeId = 'test-scrape-id'
  kcnaState.scrapeStartTime = new Date(2026, 8, 28, 9, 0)
  mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })
  mockCollection.findOne.mockResolvedValue({ seq: 0 })
  mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
})

describe('pic set date recovery when the list page had no date (bug 4)', () => {
  it('still produces a picArray and a stored date when the list-page date is null', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/6cc18ebab621338a4ce3a6fe3d514764'
    mockHTMLByURL.set(url, noDateGalleryDetailHTML)

    const result = await parsePicSetContent({ url, date: null })

    expect(result).not.toBeNull()
    expect(result.picArray).toHaveLength(2)
    expect(result.date).toEqual(kcnaState.scrapeStartTime)

    const [, updateArg] = mockCollection.updateOne.mock.calls[0]
    expect(updateArg.$set.date).toEqual(kcnaState.scrapeStartTime)
  })

  it('falls back to scrapeStartTime and logs when neither the list nor the detail page has a date', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/496d8a773f45057fd99963be55220c6a'
    mockHTMLByURL.set(url, noDateGalleryDetailHTML)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await parsePicSetContent({ url, date: null })

    expect(result.date).toEqual(kcnaState.scrapeStartTime)
    expect(logSpy.mock.calls.some(([msg]) => msg === `PIC SET DATE MISSING, USING SCRAPE TIME: ${url}`)).toBe(true)

    logSpy.mockRestore()
  })
})
