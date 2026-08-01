import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import kcnaState from '../src/util/state.js'
import {
  normalizeURL,
  normalizeDate,
  normalizeInputsTG,
  extractItemDate,
  extractDatelineDate,
  sortArrayByDate,
  calcHowMuchKCNA,
} from '../src/util/util.js'
import { articleURLs, picSetURLs, articleCategoryNames, picSetCategoryNames } from '../src/util/define-things.js'

// calcHowMuchKCNA and buildNumericId touch DB — tested separately via mocks
// These tests cover pure/near-pure functions

beforeEach(() => {
  kcnaState.scrapeActive = true
  kcnaState.scrapeStartTime = null
})

describe('current KCNA entry URLs', () => {
  it('maps current homepage category names to their verified route hashes', () => {
    expect(articleURLs).toEqual({
      fatboyArr: ['http://www.kcna.kp/en/article/list/b0721b9f23054ddc7fe56c2811a12715'],
      anecdoteArr: ['http://www.kcna.kp/en/article/list/503e9b606704f9b1c625fa5755928cd3'],
      peopleArr: ['http://www.kcna.kp/en/article/list/7bc083f00425be6aadfb828fba1cb5a7'],
      latestArr: ['http://www.kcna.kp/en/article/list/a666dda1282180e0ee1b4427b0574ae7'],
      topArr: ['http://www.kcna.kp/en/article/list/6a47505ba5268fd7749c0fe11e4b24b4'],
      homeArr: ['http://www.kcna.kp/en/article/list/2f7d854121ccbbfbe6feae9fdcc3556e'],
      documentsArr: ['http://www.kcna.kp/en/article/list/1afa96195f9b303902490a126ab7285f'],
      worldArr: ['http://www.kcna.kp/en/article/list/ecc14533d88be93068af4178946b1b05'],
      societyArr: ['http://www.kcna.kp/en/article/list/680e40b40899891bbe75a7072e3285e7'],
      externalArr: ['http://www.kcna.kp/en/article/list/e2f336db98b5e69c75e0da264e037e8d'],
    })
    expect(picSetURLs).toEqual({
      photoArr: ['http://www.kcna.kp/en/gallery/list/6837a75abf5c6249d0e39ee758e763ea'],
    })
    expect(articleCategoryNames).toEqual({
      fatboyArr: "WPK General Secretary Kim Jong Un's Revolutionary Activities",
      anecdoteArr: 'Revolutionary Anecdote',
      peopleArr: 'Always in Memory of People',
      latestArr: 'Latest News',
      topArr: 'Top News',
      homeArr: 'Home News',
      documentsArr: 'Documents',
      worldArr: 'World',
      societyArr: 'Social Life',
      externalArr: 'External',
    })
    expect(picSetCategoryNames).toEqual({ photoArr: 'Photo' })
  })

  it('selects the first URL as the newest entry when scraping new content', async () => {
    articleURLs.latestArr = ['newest', 'older']

    const result = await calcHowMuchKCNA('admin-scrape-new', 'articles')
    const latest = result.find(({ typeKey }) => typeKey === 'latestArr')

    expect(latest.pageArray).toEqual(['newest'])
  })
})

// ---- normalizeURL ----

describe('normalizeURL', () => {
  it('returns null for falsy input', () => {
    expect(normalizeURL(null)).toBeNull()
    expect(normalizeURL('')).toBeNull()
    expect(normalizeURL(undefined)).toBeNull()
  })

  it('replaces dots with [.]', () => {
    expect(normalizeURL('http://www.example.com')).toContain('[.]')
    expect(normalizeURL('http://www.example.com')).not.toContain('www.')
  })

  it('replaces colons with [:]', () => {
    const result = normalizeURL('http://example.com')
    expect(result).toContain('[:]')
    expect(result).not.toMatch(/(?<!\[):/)
  })

  it('replaces question marks with [?]', () => {
    const result = normalizeURL('http://example.com/page?q=1')
    expect(result).toContain('[?]')
    expect(result).not.toContain('?q')
  })

  it('handles a real KCNA-style URL', () => {
    const url = 'http://www.kcna.kp/en/article/q/abc123.kcmsf'
    const result = normalizeURL(url)
    expect(result).toBe('http[:]//www[.]kcna[.]kp/en/article/q/abc123[.]kcmsf')
  })
})

// ---- normalizeDate ----

describe('normalizeDate', () => {
  it('returns null for falsy input', () => {
    expect(normalizeDate(null)).toBeNull()
    expect(normalizeDate('')).toBeNull()
    expect(normalizeDate(undefined)).toBeNull()
  })

  it('returns a formatted date string', () => {
    const result = normalizeDate(new Date(2024, 0, 5)) // Jan 5 2024
    expect(typeof result).toBe('string')
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('accepts a date string input', () => {
    const result = normalizeDate('2024-06-15')
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })
})

// ---- normalizeInputsTG ----

describe('normalizeInputsTG', () => {
  it('returns null when url is missing', () => {
    expect(normalizeInputsTG(null, new Date())).toBeNull()
  })

  it('returns null when date is missing', () => {
    expect(normalizeInputsTG('http://example.com', null)).toBeNull()
  })

  it('returns object with urlNormal and dateNormal', () => {
    const result = normalizeInputsTG('http://example.com', new Date(2024, 0, 1))
    expect(result).toHaveProperty('urlNormal')
    expect(result).toHaveProperty('dateNormal')
    expect(result.urlNormal).toContain('[.]')
  })
})

// ---- extractItemDate ----

describe('extractItemDate', () => {
  it('returns null for null input', () => {
    expect(extractItemDate(null)).toBeNull()
  })

  it('returns null when no .publish-time element exists', () => {
    const dom = new JSDOM('<a href="/article"><span>No date here</span></a>')
    const el = dom.window.document.querySelector('a')
    expect(extractItemDate(el)).toBeNull()
  })

  it('parses a valid date string from DOM', () => {
    const dom = new JSDOM('<a href="/article"><span class="publish-time">[2024.06.15]</span></a>')
    const el = dom.window.document.querySelector('a')
    const result = extractItemDate(el)
    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(5) // June = 5
    expect(result.getDate()).toBe(15)
  })

  it('sets hours/minutes from scrapeStartTime when set', () => {
    const startTime = new Date(2024, 0, 1, 14, 30)
    kcnaState.scrapeStartTime = startTime

    const dom = new JSDOM('<a><span class="publish-time">[2024.06.15]</span></a>')
    const el = dom.window.document.querySelector('a')
    const result = extractItemDate(el)

    expect(result.getHours()).toBe(14)
    expect(result.getMinutes()).toBe(30)
  })

  it('returns null when date text is unparseable', () => {
    const dom = new JSDOM('<a><span class="publish-time">[not.a.date]</span></a>')
    const el = dom.window.document.querySelector('a')
    const result = extractItemDate(el)
    expect(result).toBeNull()
  })
})

// ---- extractDatelineDate ----

describe('extractDatelineDate', () => {
  it('parses the publication date from a KCNA dateline', () => {
    kcnaState.scrapeStartTime = new Date(2026, 6, 26, 21, 59)

    const result = extractDatelineDate('Pyongyang, July 18 (KCNA) -- The respected Comrade Kim Jong Un met participants.')

    expect(result).toBeInstanceOf(Date)
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(6) // July = 6
    expect(result.getDate()).toBe(18)
  })

  it('sets hours/minutes from scrapeStartTime like extractItemDate', () => {
    kcnaState.scrapeStartTime = new Date(2026, 6, 26, 21, 59)

    const result = extractDatelineDate('Pyongyang, July 18 (KCNA) -- Text.')

    expect(result.getHours()).toBe(21)
    expect(result.getMinutes()).toBe(59)
  })

  it('parses datelines from other cities', () => {
    kcnaState.scrapeStartTime = new Date(2026, 6, 26, 12, 0)

    const result = extractDatelineDate('Beijing, July 2 (KCNA) -- A delegation arrived.')

    expect(result.getMonth()).toBe(6)
    expect(result.getDate()).toBe(2)
  })

  it('infers the previous year across the December/January boundary', () => {
    kcnaState.scrapeStartTime = new Date(2027, 0, 3, 8, 15)

    const result = extractDatelineDate('Pyongyang, December 30 (KCNA) -- Year-end report.')

    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(11)
    expect(result.getDate()).toBe(30)
  })

  it('returns null for text without a dateline', () => {
    kcnaState.scrapeStartTime = new Date(2026, 6, 26, 12, 0)

    const anecdote = 'One day in early autumn 1976, President Kim Il Sung visited the then Samjigang Cooperative Farm.'

    expect(extractDatelineDate(anecdote)).toBeNull()
  })

  it('returns null for null, empty, and non-string input', () => {
    expect(extractDatelineDate(null)).toBeNull()
    expect(extractDatelineDate('')).toBeNull()
    expect(extractDatelineDate(42)).toBeNull()
  })

  it('falls back to current time when scrapeStartTime is unset', () => {
    const result = extractDatelineDate('Pyongyang, July 18 (KCNA) -- Text.')

    expect(result).toBeInstanceOf(Date)
    expect(result.getMonth()).toBe(6)
    expect(result.getDate()).toBe(18)
  })
})

// ---- sortArrayByDate ----

describe('sortArrayByDate', () => {
  beforeEach(() => {
    kcnaState.scrapeActive = true
  })

  it('returns null for empty/null input', () => {
    expect(sortArrayByDate(null)).toBeNull()
    expect(sortArrayByDate([])).toBeNull()
  })

  it('returns null when scrapeActive is false', () => {
    kcnaState.scrapeActive = false
    const arr = [{ date: new Date(), articleId: 1 }]
    expect(sortArrayByDate(arr)).toBeNull()
  })

  it('sorts articles oldest first by date', () => {
    const arr = [
      { date: new Date(2024, 2, 10), articleId: 2 },
      { date: new Date(2024, 1, 5), articleId: 1 },
      { date: new Date(2024, 5, 20), articleId: 3 },
    ]
    const result = sortArrayByDate(arr, 'articles')
    expect(result[0].articleId).toBe(1)
    expect(result[1].articleId).toBe(2)
    expect(result[2].articleId).toBe(3)
  })

  it('breaks date ties by numeric id ascending', () => {
    const sameDate = new Date(2024, 0, 1)
    const arr = [
      { date: sameDate, articleId: 5 },
      { date: sameDate, articleId: 2 },
      { date: sameDate, articleId: 8 },
    ]
    const result = sortArrayByDate(arr, 'articles')
    expect(result[0].articleId).toBe(2)
    expect(result[1].articleId).toBe(5)
    expect(result[2].articleId).toBe(8)
  })

  it('does not mutate the original array', () => {
    const arr = [
      { date: new Date(2024, 2, 10), articleId: 2 },
      { date: new Date(2024, 1, 5), articleId: 1 },
    ]
    const original = [...arr]
    sortArrayByDate(arr, 'articles')
    expect(arr[0].articleId).toBe(original[0].articleId)
  })

  it('uses picSetId key for picSets type', () => {
    const sameDate = new Date(2024, 0, 1)
    const arr = [
      { date: sameDate, picSetId: 10 },
      { date: sameDate, picSetId: 3 },
    ]
    const result = sortArrayByDate(arr, 'picSets')
    expect(result[0].picSetId).toBe(3)
    expect(result[1].picSetId).toBe(10)
  })
})
