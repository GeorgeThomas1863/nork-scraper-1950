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

vi.mock('../models/nork-model.js', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      getHTML: vi.fn().mockResolvedValue(null),
    })),
  }
})

import kcnaState from '../src/util/state.js'
import {
  extractPicSetTitle,
  buildPicSetTitleText,
  buildPicSetPicCaption,
} from '../src/kcna/picSets.js'
import { JSDOM } from 'jsdom'

beforeEach(() => {
  vi.clearAllMocks()
  kcnaState.scrapeActive = true
  kcnaState.scrapeId = 'test-scrape-id'
})

// ---- extractPicSetTitle ----

describe('extractPicSetTitle', () => {
  it('returns null for falsy document', () => {
    expect(extractPicSetTitle(null)).toBeNull()
  })

  it('returns null when .title .main span not found', () => {
    const dom = new JSDOM('<div></div>')
    expect(extractPicSetTitle(dom.window.document)).toBeNull()
  })

  it('extracts and trims pic set title', () => {
    const dom = new JSDOM('<div class="title"><div class="main"><span>  Great Feat of Our People  </span></div></div>')
    const result = extractPicSetTitle(dom.window.document)
    expect(result).toBe('Great Feat of Our People')
  })
})

// ---- buildPicSetTitleText ----

describe('buildPicSetTitleText', () => {
  it('returns null for falsy input', () => {
    expect(buildPicSetTitleText(null)).toBeNull()
  })

  it('includes title, date, picSetId, picCount, and url', () => {
    const result = buildPicSetTitleText({
      title: 'Workers Celebrate',
      dateNormal: '06/15/2024',
      picSetId: 7,
      picArray: ['pic1.jpg', 'pic2.jpg', 'pic3.jpg'],
      urlNormal: 'http[:]//www[.]kcna[.]kp/en/photo/q/abc[.]kcmsf',
    })
    expect(result).toContain('Workers Celebrate')
    expect(result).toContain('06/15/2024')
    expect(result).toContain('7')
    expect(result).toContain('3') // picCount
    expect(result).toContain('http[:]//www[.]kcna[.]kp/en/photo/q/abc[.]kcmsf')
  })

  it('uses HTML tags', () => {
    const result = buildPicSetTitleText({
      title: 'Test',
      dateNormal: '01/01/2024',
      picSetId: 1,
      picArray: ['a'],
      urlNormal: 'http[:]//example[.]com',
    })
    expect(result).toContain('<b>')
  })
})

// ---- buildPicSetPicCaption ----

describe('buildPicSetPicCaption', () => {
  it('returns null for falsy input', () => {
    expect(buildPicSetPicCaption(null)).toBeNull()
  })

  it('includes pic index, count, and normalized url', () => {
    const result = buildPicSetPicCaption({
      picIndex: 1,
      picCount: 4,
      date: new Date(2024, 5, 15),
      url: 'http://www.kcna.kp/pic1.jpg',
    })
    expect(result).toContain('1 OF 4')
    expect(result).toContain('[.]') // normalized URL
  })

  it('uses HTML bold tags', () => {
    const result = buildPicSetPicCaption({
      picIndex: 2,
      picCount: 3,
      date: new Date(2024, 0, 1),
      url: 'http://www.kcna.kp/x.jpg',
    })
    expect(result).toContain('<b>')
    expect(result).toContain('</b>')
  })
})
