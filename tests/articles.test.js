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
    default: vi.fn().mockImplementation(({ url }) => ({
      getHTML: vi.fn().mockResolvedValue(null),
    })),
  }
})

import kcnaState from '../src/util/state.js'
import {
  extractArticleTitle,
  extractArticleText,
  extractArticlePicPage,
  buildArticleTitleText,
  buildArticlePicCaption,
  buildChunkText,
} from '../src/kcna/articles.js'
import { JSDOM } from 'jsdom'

beforeEach(() => {
  vi.clearAllMocks()
  kcnaState.scrapeActive = true
  kcnaState.scrapeId = 'test-scrape-id'
})

// ---- extractArticleTitle ----

describe('extractArticleTitle', () => {
  it('returns null when element missing', () => {
    const dom = new JSDOM('<div></div>')
    expect(extractArticleTitle(dom.window.document)).toBeUndefined()
  })

  it('extracts and trims title text', () => {
    const dom = new JSDOM('<h1 class="article-main-title">  Kim Jong Un   Visits Factory  </h1>')
    const result = extractArticleTitle(dom.window.document)
    expect(result).toBe('Kim Jong Un Visits Factory')
  })

  it('collapses internal whitespace', () => {
    const dom = new JSDOM('<h1 class="article-main-title">Hello   World\n\nTest</h1>')
    const result = extractArticleTitle(dom.window.document)
    expect(result).toBe('Hello World Test')
  })
})

// ---- extractArticleText ----

describe('extractArticleText', () => {
  it('returns empty string when no content-wrapper', () => {
    const dom = new JSDOM('<div></div>')
    const result = extractArticleText(dom.window.document)
    expect(result).toBe('')
  })

  it('joins paragraphs with double newlines', () => {
    const dom = new JSDOM(`
      <div class="content-wrapper">
        <p>First paragraph.</p>
        <p>Second paragraph.</p>
        <p>Third paragraph.</p>
      </div>
    `)
    const result = extractArticleText(dom.window.document)
    expect(result).toBe('First paragraph.\n\nSecond paragraph.\n\nThird paragraph.')
  })

  it('trims whitespace from paragraphs', () => {
    const dom = new JSDOM('<div class="content-wrapper"><p>  Hello  </p></div>')
    const result = extractArticleText(dom.window.document)
    expect(result).toBe('Hello')
  })
})

// ---- extractArticlePicPage ----

describe('extractArticlePicPage', () => {
  it('returns null when no .media-icon element', () => {
    const dom = new JSDOM('<div></div>')
    expect(extractArticlePicPage(dom.window.document)).toBeNull()
  })

  it('returns null when firstElementChild has no href', () => {
    const dom = new JSDOM('<div class="media-icon"><span></span></div>')
    expect(extractArticlePicPage(dom.window.document)).toBeNull()
  })

  it('constructs full pic page URL from href', () => {
    const dom = new JSDOM('<div class="media-icon"><a href="/en/photo/q/abc.kcmsf">pics</a></div>')
    const result = extractArticlePicPage(dom.window.document)
    expect(result).toBe('http://www.kcna.kp/en/photo/q/abc.kcmsf')
  })
})

// ---- buildArticleTitleText ----

describe('buildArticleTitleText', () => {
  it('returns null for falsy input', () => {
    expect(buildArticleTitleText(null)).toBeNull()
  })

  it('includes all relevant fields in output', () => {
    const result = buildArticleTitleText({
      title: 'Kim Inspects Factory',
      dateNormal: '06/15/2024',
      articleType: 'fatboy',
      articleId: 42,
      urlNormal: 'http[:]//www[.]kcna[.]kp/en/article/q/abc[.]kcmsf',
    })
    expect(result).toContain('Kim Inspects Factory')
    expect(result).toContain('06/15/2024')
    expect(result).toContain('fatboy')
    expect(result).toContain('42')
    expect(result).toContain('http[:]//www[.]kcna[.]kp/en/article/q/abc[.]kcmsf')
  })

  it('uses HTML bold tags', () => {
    const result = buildArticleTitleText({
      title: 'Test',
      dateNormal: '01/01/2024',
      articleType: 'general',
      articleId: 1,
      urlNormal: 'http[:]//example[.]com',
    })
    expect(result).toContain('<b>')
    expect(result).toContain('</b>')
  })
})

// ---- buildArticlePicCaption ----

describe('buildArticlePicCaption', () => {
  it('returns null for falsy input', () => {
    expect(buildArticlePicCaption(null)).toBeNull()
  })

  it('includes pic index, count, date and url', () => {
    const result = buildArticlePicCaption({
      picIndex: 2,
      picCount: 5,
      date: new Date(2024, 5, 15),
      url: 'http://www.kcna.kp/pic1.jpg',
    })
    expect(result).toContain('2 OF 5')
    expect(result).toContain('[.]')  // normalized URL
  })
})

// ---- buildChunkText ----

describe('buildChunkText', () => {
  it('returns null for falsy inputObj', () => {
    expect(buildChunkText('text', null, 0)).toBeNull()
  })

  it('prepends [ARTICLE TEXT] header on first chunk', () => {
    const result = buildChunkText('Hello world', { urlNormal: 'http[:]//x[.]com', chunkTotal: 2 }, 0)
    expect(result).toContain('[ARTICLE TEXT]')
  })

  it('appends URL on last chunk', () => {
    const result = buildChunkText('End text', { urlNormal: 'http[:]//x[.]com', chunkTotal: 3 }, 2)
    expect(result).toContain('http[:]//x[.]com')
    expect(result).toContain('URL')
  })

  it('does not add header/footer for middle chunks', () => {
    const result = buildChunkText('Middle text', { urlNormal: 'http[:]//x[.]com', chunkTotal: 3 }, 1)
    expect(result).not.toContain('[ARTICLE TEXT]')
    expect(result).not.toContain('URL')
    expect(result).toBe('Middle text')
  })

  it('adds both header and footer when chunk is both first and last (single chunk)', () => {
    const result = buildChunkText('Only chunk', { urlNormal: 'http[:]//x[.]com', chunkTotal: 1 }, 0)
    expect(result).toContain('[ARTICLE TEXT]')
    expect(result).toContain('URL')
  })
})
