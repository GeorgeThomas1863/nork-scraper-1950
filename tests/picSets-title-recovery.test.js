import { describe, it, expect, vi, beforeEach } from 'vitest'

// Bug 5: two real gallery detail pages logged neither "PIC SET CONTENT STORED"
// nor a failure, staying stuck with no title and an empty picArray. Fetched
// 2026-09-28 (http://www.kcna.kp/en/gallery/detail/e5853b58a9f50651db72719c7a39fcb6
// and .../90cb015a4c372ff0af6743daf82bdf3c): both pages carry a picture set
// title with an embedded, unescaped double quote inside the img alt="" attribute.
// That truncates the attribute during HTML parsing (alt ends up ""), so both
// extractPicSetTitle selectors miss it and parsePicSetContent's title guard
// clause discards the page before extractPicSetPicArray is ever called — the
// single real photo on the page is never reached. extractPicSetTitle now falls
// back to the <title> tag, which carries the same text unquoted.

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
import { parsePicSetContent, extractPicSetTitle } from '../src/kcna/picSets.js'
import { quotedTitleGalleryDetailHTML } from './fixtures/kcna-picset-quirks.js'
import { JSDOM } from 'jsdom'

beforeEach(() => {
  vi.clearAllMocks()
  mockHTMLByURL.clear()
  kcnaState.scrapeActive = true
  kcnaState.scrapeId = 'test-scrape-id'
  mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })
  mockCollection.findOne.mockResolvedValue({ seq: 0 })
  mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
})

describe('extractPicSetTitle recovers a title with an unescaped quote (bug 5)', () => {
  it('falls back to the <title> tag when the alt attribute is truncated', () => {
    const dom = new JSDOM(quotedTitleGalleryDetailHTML)
    const result = extractPicSetTitle(dom.window.document)

    expect(result).toBe(`"Complete Collection of Kim Jong Il's Works" Published`)
  })
})

describe('parsePicSetContent on the real quoted-title fixture (bug 5)', () => {
  it('parses to a title and at least one picture instead of discarding the page', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/e5853b58a9f50651db72719c7a39fcb6'
    mockHTMLByURL.set(url, quotedTitleGalleryDetailHTML)

    const result = await parsePicSetContent({ url, date: new Date(2026, 8, 8) })

    expect(result).not.toBeNull()
    expect(result.title).toBe(`"Complete Collection of Kim Jong Il's Works" Published`)
    expect(result.picArray.length).toBeGreaterThanOrEqual(1)
  })

  it('logs which part was missing before the fallback, for a page with no title at all', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/no-title-anywhere'
    mockHTMLByURL.set(url, '<main><div class="content"><img src="/photo/one"></div></main>')
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await parsePicSetContent({ url, date: new Date(2026, 8, 8) })

    expect(result).toBeNull()
    expect(logSpy.mock.calls.some(([msg]) => msg === `PIC SET CONTENT MISSING: ${url} | NO TITLE`)).toBe(true)

    logSpy.mockRestore()
  })
})
