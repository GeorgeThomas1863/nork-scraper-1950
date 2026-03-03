import { describe, it, expect, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import kcnaState from '../src/util/state.js'
import {
  normalizeURL,
  normalizeDate,
  normalizeInputsTG,
  extractItemDate,
  sortArrayByDate,
} from '../src/util/util.js'

// calcHowMuchKCNA and buildNumericId touch DB — tested separately via mocks
// These tests cover pure/near-pure functions

beforeEach(() => {
  kcnaState.scrapeActive = true
  kcnaState.scrapeStartTime = null
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
