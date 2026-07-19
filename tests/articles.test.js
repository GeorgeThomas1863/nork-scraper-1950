import { describe, it, expect, vi, beforeEach } from 'vitest'

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
import {
  extractArticleTitle,
  extractArticleText,
  extractArticlePicPage,
  buildArticleTitleText,
  buildArticlePicCaption,
  buildChunkText,
  postArticleContentTG,
  postArticleTG,
  uploadArticlesKCNA,
  parseArticleListPage,
  parseArticleContent,
  scrapeArticleURLsKCNA,
  scrapeArticleContentKCNA,
} from '../src/kcna/articles.js'
import { JSDOM } from 'jsdom'
import { currentArticleListHTML, currentArticleDetailHTML, currentGalleryDetailHTML } from './fixtures/kcna-current.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockHTMLByURL.clear()
  kcnaState.scrapeActive = true
  kcnaState.scrapeId = 'test-scrape-id'
  mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })
})

describe('current KCNA article markup', () => {
  it('fails the requested listing stage when every page produces zero candidates', async () => {
    const pageURL = 'http://www.kcna.kp/en/article/list/empty'
    mockHTMLByURL.set(pageURL, '<main></main>')

    await expect(scrapeArticleURLsKCNA([{ typeKey: 'topArr', pageArray: [pageURL] }]))
      .rejects.toThrow('Article listing produced zero candidates')
  })

  it('fails the listing stage when every candidate store is unacknowledged', async () => {
    const pageURL = 'http://www.kcna.kp/en/article/list/6a47505ba5268fd7749c0fe11e4b24b4'
    mockHTMLByURL.set(pageURL, currentArticleListHTML)
    mockCollection.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ seq: 40 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 41 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: false })

    await expect(scrapeArticleURLsKCNA([{ typeKey: 'topArr', pageArray: [pageURL] }]))
      .rejects.toThrow('Failed to store article URL')
  })

  it('fails the listing stage when every candidate store throws', async () => {
    const pageURL = 'http://www.kcna.kp/en/article/list/6a47505ba5268fd7749c0fe11e4b24b4'
    mockHTMLByURL.set(pageURL, currentArticleListHTML)
    mockCollection.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ seq: 40 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 41 })
    mockCollection.insertOne.mockRejectedValue(new Error('mongo down'))

    await expect(scrapeArticleURLsKCNA([{ typeKey: 'topArr', pageArray: [pageURL] }]))
      .rejects.toThrow('mongo down')
  })

  it('allows duplicate-only listing pages without reporting new stores', async () => {
    const pageURL = 'http://www.kcna.kp/en/article/list/6a47505ba5268fd7749c0fe11e4b24b4'
    mockHTMLByURL.set(pageURL, currentArticleListHTML)
    mockCollection.findOne.mockResolvedValue({ url: 'already stored' })

    const result = await scrapeArticleURLsKCNA([{ typeKey: 'topArr', pageArray: [pageURL] }])

    expect(result).toEqual([])
    expect(mockCollection.insertOne).not.toHaveBeenCalled()
  })

  it('parses current article list links, dates, and absolute URLs', async () => {
    const pageURL = 'http://www.kcna.kp/en/article/list/6a47505ba5268fd7749c0fe11e4b24b4'
    mockHTMLByURL.set(pageURL, currentArticleListHTML)
    mockCollection.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ seq: 40 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 41 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })

    const result = await parseArticleListPage(pageURL, 'top')

    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('http://www.kcna.kp/en/article/detail/99d235cb100ee217cd6678bb8fc80e4d')
    expect(result[0]).toMatchObject({
      pageURL,
      articleType: 'top',
      scrapeId: 'test-scrape-id',
      articleId: 41,
    })
    expect(result[0].date).toEqual(new Date(2026, 6, 19))
    expect(result.candidateCount).toBe(1)
  })

  it('extracts the current title and direct article paragraphs', () => {
    const document = new JSDOM(currentArticleDetailHTML).window.document

    expect(extractArticleTitle(document)).toBe('Current KCNA Article')
    expect(extractArticleText(document)).toBe('First paragraph.\n\nSecond paragraph.')
  })

  it('does not persist article detail when the title is missing', async () => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/missing-title'
    mockHTMLByURL.set(articleURL, '<main><article><div class="container"><p>Body</p></div></article></main>')

    expect(await parseArticleContent({ url: articleURL, date: new Date(2026, 6, 19) })).toBeNull()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()
  })

  it('does not persist article detail when the text is empty', async () => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/missing-text'
    mockHTMLByURL.set(articleURL, '<main><article><div class="container"><h1>Title</h1></div></article></main>')

    expect(await parseArticleContent({ url: articleURL, date: new Date(2026, 6, 19) })).toBeNull()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()
  })

  it('retries legacy article records whose title is missing', async () => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/legacy'
    const article = { url: articleURL, date: new Date(2026, 6, 19), text: 'Legacy body', title: null }
    mockHTMLByURL.set(articleURL, currentArticleDetailHTML)
    mockHTMLByURL.set('http://www.kcna.kp/en/gallery/detail/b13bb492c9ddf31add8a84cbe137c5a6', currentGalleryDetailHTML)
    mockCollection.find
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([article]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) })
    mockCollection.findOne.mockResolvedValue({ seq: 0 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })

    const result = await scrapeArticleContentKCNA()

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Current KCNA Article')
  })

  it.each([
    [{ acknowledged: false, matchedCount: 1 }, 'unacknowledged'],
    [{ acknowledged: true, matchedCount: 0 }, 'unmatched'],
  ])('does not count an article detail as successful when its parent update is %s', async (updateResult) => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/update-failure'
    mockHTMLByURL.set(articleURL, currentArticleDetailHTML.replace(/<a href="\/en\/gallery[^>]+>Photos<\/a>/, ''))
    mockCollection.updateOne.mockResolvedValue(updateResult)

    expect(await parseArticleContent({ url: articleURL, date: new Date(2026, 6, 19) })).toBeNull()
  })

  it('does not count an article detail as successful when its parent update throws', async () => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/update-error'
    mockHTMLByURL.set(articleURL, currentArticleDetailHTML.replace(/<a href="\/en\/gallery[^>]+>Photos<\/a>/, ''))
    mockCollection.updateOne.mockRejectedValue(new Error('mongo down'))

    expect(await parseArticleContent({ url: articleURL, date: new Date(2026, 6, 19) })).toBeNull()
  })

  it.each([
    [{ acknowledged: false }, 'unacknowledged'],
    [new Error('photo insert failed'), 'exception'],
  ])('fails article detail without retaining a photo URL when its photo store has an %s result', async (storeResult) => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/photo-store-failure'
    const galleryURL = 'http://www.kcna.kp/en/gallery/detail/b13bb492c9ddf31add8a84cbe137c5a6'
    mockHTMLByURL.set(articleURL, currentArticleDetailHTML)
    mockHTMLByURL.set(galleryURL, currentGalleryDetailHTML)
    mockCollection.findOne
      .mockResolvedValueOnce({ seq: 0 })
      .mockResolvedValueOnce(null)
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    if (storeResult instanceof Error) mockCollection.insertOne.mockRejectedValue(storeResult)
    else mockCollection.insertOne.mockResolvedValue(storeResult)

    await expect(parseArticleContent({ url: articleURL, date: new Date(2026, 6, 19) })).rejects.toThrow()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()
  })

  it('leaves an article retryable when a linked gallery temporarily has no photos', async () => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/transient-gallery'
    const galleryURL = 'http://www.kcna.kp/en/gallery/detail/b13bb492c9ddf31add8a84cbe137c5a6'
    const article = { url: articleURL, date: new Date(2026, 6, 19), picPageURL: galleryURL, picArray: [] }
    mockHTMLByURL.set(articleURL, currentArticleDetailHTML)
    mockHTMLByURL.set(galleryURL, '<main><div class="slider"></div></main>')

    expect(await parseArticleContent(article)).toBeNull()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()

    mockHTMLByURL.set(galleryURL, currentGalleryDetailHTML)
    mockCollection.find
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([article]) })
    mockCollection.findOne.mockResolvedValue({ seq: 0 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })
    mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })

    const result = await scrapeArticleContentKCNA()

    expect(result).toHaveLength(1)
    expect(result[0].picArray).toHaveLength(2)
  })

  it('does not persist a partial article photo array when scraping is cancelled', async () => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/cancelled-photos'
    const galleryURL = 'http://www.kcna.kp/en/gallery/detail/b13bb492c9ddf31add8a84cbe137c5a6'
    mockHTMLByURL.set(articleURL, currentArticleDetailHTML)
    mockHTMLByURL.set(galleryURL, currentGalleryDetailHTML)
    mockCollection.findOne
      .mockResolvedValueOnce({ seq: 0 })
      .mockResolvedValueOnce(null)
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.insertOne.mockImplementationOnce(async () => {
      kcnaState.scrapeActive = false
      return { acknowledged: true }
    })
    mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })

    expect(await parseArticleContent({ url: articleURL, date: new Date(2026, 6, 19) })).toBeNull()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()

    kcnaState.scrapeActive = true
    mockCollection.findOne.mockResolvedValue({ url: 'existing photo' })
    const retryResult = await parseArticleContent({ url: articleURL, date: new Date(2026, 6, 19) })

    expect(retryResult.picArray).toHaveLength(2)
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(1)
  })

  it('processes an article only once when multiple retry conditions match', async () => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/multiple-gaps'
    const article = {
      url: articleURL,
      date: new Date(2026, 6, 19),
      title: null,
      text: null,
      picPageURL: 'http://www.kcna.kp/en/gallery/detail/b13bb492c9ddf31add8a84cbe137c5a6',
      picArray: [],
    }
    mockHTMLByURL.set(articleURL, currentArticleDetailHTML)
    mockHTMLByURL.set(article.picPageURL, currentGalleryDetailHTML)
    mockCollection.find
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([article]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([article]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([article]) })
    mockCollection.findOne.mockResolvedValue({ seq: 0 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })
    mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })

    const result = await scrapeArticleContentKCNA()

    expect(result).toHaveLength(1)
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(1)
  })

  it('uses the linked current gallery detail page for article pictures', async () => {
    const articleURL = 'http://www.kcna.kp/en/article/detail/example'
    const galleryURL = 'http://www.kcna.kp/en/gallery/detail/b13bb492c9ddf31add8a84cbe137c5a6'
    mockHTMLByURL.set(articleURL, currentArticleDetailHTML)
    mockHTMLByURL.set(galleryURL, currentGalleryDetailHTML)
    mockCollection.findOne.mockResolvedValue({ seq: 0 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })

    const result = await parseArticleContent({ url: articleURL, date: new Date(2026, 6, 19) })

    expect(result.picPageURL).toBe(galleryURL)
    expect(result.picArray).toEqual([
      'http://www.kcna.kp/photo/one',
      'http://www.kcna.kp/photo/two',
    ])
  })
})

// ---- extractArticleTitle ----

describe('extractArticleTitle', () => {
  it('returns null when element missing', () => {
    const dom = new JSDOM('<div></div>')
    expect(extractArticleTitle(dom.window.document)).toBeNull()
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

  it('returns null when url is missing', () => {
    expect(buildArticlePicCaption({ picIndex: 1, picCount: 3, date: new Date(), url: null })).toBeNull()
  })

  it('returns null when date is missing', () => {
    expect(buildArticlePicCaption({ picIndex: 1, picCount: 3, date: null, url: 'http://www.kcna.kp/pic1.jpg' })).toBeNull()
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

// ---- postArticleContentTG ----

describe('postArticleContentTG', () => {
  beforeEach(() => {
    process.env.TG_MAX_LENGTH = '4096'
  })

  it('returns null when inputObj is falsy', async () => {
    expect(await postArticleContentTG(null)).toBeNull()
  })

  it('returns null when text is missing', async () => {
    expect(await postArticleContentTG({ title: 'Title' })).toBeNull()
  })

  it('does not crash when title is null', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    tgSendMessage.mockResolvedValue({ ok: true })

    await expect(postArticleContentTG({
      text: 'Article body',
      title: null,
      dateNormal: '06/15/2024',
      urlNormal: 'http[:]//www[.]kcna[.]kp/article',
      tgChannelId: '-100123',
    })).resolves.not.toThrow()
  })

  it('returns null when delivery is cancelled between content chunks', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    process.env.TG_MAX_LENGTH = '60'
    tgSendMessage.mockImplementation(async () => {
      kcnaState.scrapeActive = false
      return { ok: true }
    })

    const result = await postArticleContentTG({
      text: 'This body requires more than one chunk.',
      title: '',
      dateNormal: '',
      urlNormal: 'x',
      tgChannelId: '-100123',
    })

    expect(result).toBeNull()
  })

  it('does not crash when dateNormal and urlNormal are undefined', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    tgSendMessage.mockResolvedValue({ ok: true })

    await expect(postArticleContentTG({
      text: 'Article body',
      title: 'Some Title',
      dateNormal: undefined,
      urlNormal: undefined,
      tgChannelId: '-100123',
    })).resolves.not.toThrow()
  })
})

// ---- Telegram delivery correctness ----

describe('article Telegram delivery', () => {
  it('returns false when the title succeeds but article content fails', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    tgSendMessage.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(null)

    const result = await postArticleTG({
      url: 'http://www.kcna.kp/article',
      date: new Date(2024, 5, 15),
      title: 'Title',
      text: 'Body',
      articleType: 'news',
      articleId: 1,
      tgChannelId: '-100123',
    })

    expect(result).toBe(false)
  })

  it('leaves an article retryable when a required send fails', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    tgSendMessage.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(null)
    mockCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{
      url: 'http://www.kcna.kp/article',
      date: new Date(2024, 5, 15),
      title: 'Title',
      text: 'Body',
      articleType: 'news',
      articleId: 1,
    }]) })

    const result = await uploadArticlesKCNA()

    expect(result).toEqual([])
    for (const [, update] of mockCollection.updateOne.mock.calls) expect(update.$set.uploaded).not.toBe(true)
  })

  it('does not duplicate a successful title and content prefix on retry', async () => {
    process.env.TG_MAX_LENGTH = '135'
    const { tgSendMessage } = await import('../src/tg-api.js')
    const article = {
      url: 'http://www.kcna.kp/article', date: new Date(2024, 5, 15), title: 'Title',
      text: 'A'.repeat(80), articleType: 'news', articleId: 1,
    }
    mockCollection.find
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([article]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([{ ...article, telegramDelivery: { titleSent: true, contentChunksSent: 1, photosSent: 0 } }]) })
    tgSendMessage
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ ok: true })

    await uploadArticlesKCNA()
    await uploadArticlesKCNA()

    const sentTexts = tgSendMessage.mock.calls.map(([params]) => params.text)
    expect(sentTexts.filter((text) => text.includes('KCNA ARTICLE:'))).toHaveLength(1)
    expect(sentTexts.filter((text) => text.includes('[ARTICLE TEXT]'))).toHaveLength(1)
  })

  it('keeps every escaped content message within TG_MAX_LENGTH', async () => {
    process.env.TG_MAX_LENGTH = '140'
    const { tgSendMessage } = await import('../src/tg-api.js')
    tgSendMessage.mockResolvedValue({ ok: true })

    const result = await postArticleContentTG({
      text: '<&>'.repeat(60), title: '', dateNormal: '', urlNormal: 'x&y', tgChannelId: '-100123',
    })

    expect(result.length).toBeGreaterThan(1)
    for (const [params] of tgSendMessage.mock.calls) expect(params.text.length).toBeLessThanOrEqual(140)
  })

  it.each(['', '0', '-1', 'not-a-number'])('rejects invalid TG_MAX_LENGTH %s', async (value) => {
    process.env.TG_MAX_LENGTH = value
    const { tgSendMessage } = await import('../src/tg-api.js')

    expect(await postArticleContentTG({ text: 'Body', urlNormal: 'x', tgChannelId: '-100123' })).toBeNull()
    expect(tgSendMessage).not.toHaveBeenCalled()
  })

  it('does not report an article uploaded when Mongo matches no document', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    tgSendMessage.mockResolvedValue({ ok: true })
    mockCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{
      url: 'http://www.kcna.kp/article', date: new Date(2024, 5, 15), title: 'Title', text: 'Body', articleType: 'news', articleId: 1,
    }]) })
    mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 0 })

    expect(await uploadArticlesKCNA()).toEqual([])
  })

  it('does not persist runtime-only tgChannelId', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    tgSendMessage.mockResolvedValue({ ok: true })
    mockCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{
      url: 'http://www.kcna.kp/article', date: new Date(2024, 5, 15), title: 'Title', text: 'Body', articleType: 'news', articleId: 1,
    }]) })

    await uploadArticlesKCNA()

    for (const [, update] of mockCollection.updateOne.mock.calls) expect(update.$set.tgChannelId).toBeUndefined()
  })

  it('escapes scraped HTML characters at the Telegram boundary', () => {
    const title = 'A < B & C > D'
    const article = { title, dateNormal: '06/15/2024', articleType: 'news & analysis', articleId: 1, urlNormal: 'x&y' }
    const titleText = buildArticleTitleText(article)
    const chunkText = buildChunkText('Body <tag> & text', { urlNormal: 'x&y', chunkTotal: 1 }, 0)

    expect(titleText).toContain('A &lt; B &amp; C &gt; D')
    expect(titleText).toContain('news &amp; analysis')
    expect(chunkText).toContain('Body &lt;tag&gt; &amp; text')
    expect(article.title).toBe(title)
  })
})
