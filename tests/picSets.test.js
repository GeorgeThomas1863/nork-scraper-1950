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
  extractPicSetTitle,
  buildPicSetTitleText,
  buildPicSetPicCaption,
  postPicSetTG,
  uploadPicSetsKCNA,
  parsePicSetListPage,
  parsePicSetContent,
  scrapePicSetURLsKCNA,
  scrapePicSetContentKCNA,
} from '../src/kcna/picSets.js'
import { JSDOM } from 'jsdom'
import { currentGalleryListHTML, currentGalleryDetailHTML } from './fixtures/kcna-current.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockHTMLByURL.clear()
  kcnaState.scrapeActive = true
  kcnaState.scrapeId = 'test-scrape-id'
  mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })
})

describe('current KCNA gallery markup', () => {
  it('fails the requested listing stage when every page produces zero candidates', async () => {
    const pageURL = 'http://www.kcna.kp/en/gallery/list/empty'
    mockHTMLByURL.set(pageURL, '<main></main>')

    await expect(scrapePicSetURLsKCNA([{ typeKey: 'photoArr', pageArray: [pageURL] }]))
      .rejects.toThrow('Gallery listing produced zero candidates')
  })

  it('fails the listing stage when every candidate store is unacknowledged', async () => {
    const pageURL = 'http://www.kcna.kp/en/gallery/list/6837a75abf5c6249d0e39ee758e763ea'
    mockHTMLByURL.set(pageURL, currentGalleryListHTML)
    mockCollection.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ seq: 6 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 7 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: false })

    await expect(scrapePicSetURLsKCNA([{ typeKey: 'photoArr', pageArray: [pageURL] }]))
      .rejects.toThrow('Failed to store gallery URL')
  })

  it('fails the listing stage when every candidate store throws', async () => {
    const pageURL = 'http://www.kcna.kp/en/gallery/list/6837a75abf5c6249d0e39ee758e763ea'
    mockHTMLByURL.set(pageURL, currentGalleryListHTML)
    mockCollection.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ seq: 6 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 7 })
    mockCollection.insertOne.mockRejectedValue(new Error('mongo down'))

    await expect(scrapePicSetURLsKCNA([{ typeKey: 'photoArr', pageArray: [pageURL] }]))
      .rejects.toThrow('mongo down')
  })

  it('allows duplicate-only listing pages without reporting new stores', async () => {
    const pageURL = 'http://www.kcna.kp/en/gallery/list/6837a75abf5c6249d0e39ee758e763ea'
    mockHTMLByURL.set(pageURL, currentGalleryListHTML)
    mockCollection.findOne.mockResolvedValue({ url: 'already stored' })

    const result = await scrapePicSetURLsKCNA([{ typeKey: 'photoArr', pageArray: [pageURL] }])

    expect(result).toEqual([])
    expect(mockCollection.insertOne).not.toHaveBeenCalled()
  })

  it('parses current gallery list links, dates, and absolute URLs', async () => {
    const pageURL = 'http://www.kcna.kp/en/gallery/list/6837a75abf5c6249d0e39ee758e763ea'
    mockHTMLByURL.set(pageURL, currentGalleryListHTML)
    mockCollection.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ seq: 6 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 7 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })

    const result = await parsePicSetListPage(pageURL, 'photo')

    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('http://www.kcna.kp/en/gallery/detail/28af137e48afca98ec87cf2e1b88f5b4')
    expect(result[0]).toMatchObject({
      pageURL,
      picSetType: 'photo',
      scrapeId: 'test-scrape-id',
      picSetId: 7,
    })
    expect(result[0].date).toEqual(new Date(2026, 6, 19))
    expect(result.candidateCount).toBe(1)
  })

  it('does not persist gallery detail when the title is missing', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/missing-title'
    mockHTMLByURL.set(url, '<main><div class="thumbnail-img"><img src="/photo/one"></div></main>')

    expect(await parsePicSetContent({ url, date: new Date(2026, 6, 19) })).toBeNull()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()
  })

  it('does not persist gallery detail when no photos are found', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/missing-photos'
    mockHTMLByURL.set(url, '<main><div class="thumbnail-img"><img alt="Title"></div></main>')

    expect(await parsePicSetContent({ url, date: new Date(2026, 6, 19) })).toBeNull()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()
  })

  it('retries legacy gallery records whose title is missing', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/legacy'
    const picSet = { url, date: new Date(2026, 6, 19), title: null, picArray: ['legacy-photo'] }
    mockHTMLByURL.set(url, currentGalleryDetailHTML)
    mockCollection.find
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([picSet]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) })
    mockCollection.findOne.mockResolvedValue({ seq: 0 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })

    const result = await scrapePicSetContentKCNA()

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Belarusian Delegation Visits Mangyongdae')
  })

  it('retries legacy gallery records whose photo array is empty', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/empty-photos'
    const picSet = { url, date: new Date(2026, 6, 19), title: 'Legacy title', picArray: [] }
    mockHTMLByURL.set(url, currentGalleryDetailHTML)
    mockCollection.find
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([picSet]) })
    mockCollection.findOne.mockResolvedValue({ seq: 0 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })

    const result = await scrapePicSetContentKCNA()

    expect(result).toHaveLength(1)
    expect(result[0].picArray).toHaveLength(2)
  })

  it.each([
    [{ acknowledged: false, matchedCount: 1 }, 'unacknowledged'],
    [{ acknowledged: true, matchedCount: 0 }, 'unmatched'],
  ])('does not count a gallery detail as successful when its parent update is %s', async (updateResult) => {
    const url = 'http://www.kcna.kp/en/gallery/detail/update-failure'
    mockHTMLByURL.set(url, currentGalleryDetailHTML)
    mockCollection.findOne.mockResolvedValue({ url: 'existing photo' })
    mockCollection.updateOne.mockResolvedValue(updateResult)

    expect(await parsePicSetContent({ url, date: new Date(2026, 6, 19) })).toBeNull()
  })

  it('does not count a gallery detail as successful when its parent update throws', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/update-error'
    mockHTMLByURL.set(url, currentGalleryDetailHTML)
    mockCollection.findOne.mockResolvedValue({ url: 'existing photo' })
    mockCollection.updateOne.mockRejectedValue(new Error('mongo down'))

    expect(await parsePicSetContent({ url, date: new Date(2026, 6, 19) })).toBeNull()
  })

  it.each([
    [{ acknowledged: false }, 'unacknowledged'],
    [new Error('photo insert failed'), 'exception'],
  ])('fails gallery detail without retaining a photo URL when its photo store has an %s result', async (storeResult) => {
    const url = 'http://www.kcna.kp/en/gallery/detail/photo-store-failure'
    mockHTMLByURL.set(url, currentGalleryDetailHTML)
    mockCollection.findOne
      .mockResolvedValueOnce({ seq: 0 })
      .mockResolvedValueOnce(null)
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    if (storeResult instanceof Error) mockCollection.insertOne.mockRejectedValue(storeResult)
    else mockCollection.insertOne.mockResolvedValue(storeResult)

    await expect(parsePicSetContent({ url, date: new Date(2026, 6, 19) })).rejects.toThrow()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()
  })

  it('does not persist a partial gallery photo array when scraping is cancelled', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/cancelled-photos'
    mockHTMLByURL.set(url, currentGalleryDetailHTML)
    mockCollection.findOne
      .mockResolvedValueOnce({ seq: 0 })
      .mockResolvedValueOnce(null)
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.insertOne.mockImplementationOnce(async () => {
      kcnaState.scrapeActive = false
      return { acknowledged: true }
    })
    mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })

    expect(await parsePicSetContent({ url, date: new Date(2026, 6, 19) })).toBeNull()
    expect(mockCollection.updateOne).not.toHaveBeenCalled()

    kcnaState.scrapeActive = true
    mockCollection.findOne.mockResolvedValue({ url: 'existing photo' })
    const retryResult = await parsePicSetContent({ url, date: new Date(2026, 6, 19) })

    expect(retryResult.picArray).toHaveLength(2)
    expect(mockCollection.updateOne).toHaveBeenCalledTimes(1)
  })

  it('extracts the gallery title and all current photo URLs', async () => {
    const url = 'http://www.kcna.kp/en/gallery/detail/example'
    mockHTMLByURL.set(url, currentGalleryDetailHTML)
    mockCollection.findOne.mockResolvedValue({ seq: 0 })
    mockCollection.findOneAndUpdate.mockResolvedValue({ seq: 1 })
    mockCollection.updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })
    mockCollection.insertOne.mockResolvedValue({ acknowledged: true })

    const result = await parsePicSetContent({ url, date: new Date(2026, 6, 19) })

    expect(result.title).toBe('Belarusian Delegation Visits Mangyongdae')
    expect(result.picArray).toEqual([
      'http://www.kcna.kp/photo/one',
      'http://www.kcna.kp/photo/two',
    ])
  })
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

  it('returns null when url is missing', () => {
    expect(buildPicSetPicCaption({ picIndex: 1, picCount: 3, date: new Date(), url: null })).toBeNull()
  })

  it('returns null when date is missing', () => {
    expect(buildPicSetPicCaption({ picIndex: 1, picCount: 3, date: null, url: 'http://www.kcna.kp/pic1.jpg' })).toBeNull()
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

// ---- Telegram delivery correctness ----

describe('pic set Telegram delivery', () => {
  it('returns false when the title succeeds but a photo fails', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    const { postPicArrayTG } = await import('../src/kcna/pics.js')
    tgSendMessage.mockResolvedValue({ ok: true })
    postPicArrayTG.mockResolvedValue([])

    const result = await postPicSetTG({
      url: 'http://www.kcna.kp/photo',
      date: new Date(2024, 5, 15),
      title: 'Title',
      picSetId: 1,
      picArray: [{ url: 'http://www.kcna.kp/pic.jpg', savePath: '/tmp/pic.jpg', date: new Date(2024, 5, 15) }],
      tgChannelId: '-100123',
    })

    expect(result).toBe(false)
  })

  it('leaves a pic set retryable when a required photo send fails', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    const { postPicArrayTG } = await import('../src/kcna/pics.js')
    tgSendMessage.mockResolvedValue({ ok: true })
    postPicArrayTG.mockResolvedValue([])
    mockCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{
      url: 'http://www.kcna.kp/photo',
      date: new Date(2024, 5, 15),
      title: 'Title',
      picSetId: 1,
      picArray: [{ url: 'http://www.kcna.kp/pic.jpg', savePath: '/tmp/pic.jpg', date: new Date(2024, 5, 15) }],
    }]) })

    const result = await uploadPicSetsKCNA()

    expect(result).toEqual([])
    for (const [, update] of mockCollection.updateOne.mock.calls) expect(update.$set.uploaded).not.toBe(true)
  })

  it('does not duplicate a successful title and photo prefix on retry', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    const { postPicArrayTG } = await import('../src/kcna/pics.js')
    const picSet = {
      url: 'http://www.kcna.kp/photo', date: new Date(2024, 5, 15), title: 'Title', picSetId: 1,
      picArray: [
        { url: 'http://www.kcna.kp/1.jpg', savePath: '/tmp/1.jpg', date: new Date(2024, 5, 15) },
        { url: 'http://www.kcna.kp/2.jpg', savePath: '/tmp/2.jpg', date: new Date(2024, 5, 15) },
      ],
    }
    mockCollection.find
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([picSet]) })
      .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([{ ...picSet, telegramDelivery: { titleSent: true, photosSent: 1 } }]) })
    tgSendMessage.mockResolvedValue({ ok: true })
    postPicArrayTG
      .mockResolvedValueOnce([{ ok: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ok: true }])

    await uploadPicSetsKCNA()
    await uploadPicSetsKCNA()

    expect(tgSendMessage).toHaveBeenCalledTimes(1)
    expect(postPicArrayTG).toHaveBeenCalledTimes(3)
    expect(postPicArrayTG.mock.calls[2][0][0].url).toContain('/2.jpg')
  })

  it('does not report a pic set uploaded when Mongo rejects the final update', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    const { postPicArrayTG } = await import('../src/kcna/pics.js')
    tgSendMessage.mockResolvedValue({ ok: true })
    postPicArrayTG.mockResolvedValue([{ ok: true }])
    mockCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{
      url: 'http://www.kcna.kp/photo', date: new Date(2024, 5, 15), title: 'Title', picSetId: 1,
      picArray: [{ url: 'http://www.kcna.kp/1.jpg', savePath: '/tmp/1.jpg', date: new Date(2024, 5, 15) }],
    }]) })
    mockCollection.updateOne
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1 })
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1 })
      .mockRejectedValueOnce(new Error('mongo down'))

    expect(await uploadPicSetsKCNA()).toEqual([])
  })

  it('does not persist runtime-only tgChannelId', async () => {
    const { tgSendMessage } = await import('../src/tg-api.js')
    const { postPicArrayTG } = await import('../src/kcna/pics.js')
    tgSendMessage.mockResolvedValue({ ok: true })
    postPicArrayTG.mockResolvedValue([{ ok: true }])
    mockCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{
      url: 'http://www.kcna.kp/photo', date: new Date(2024, 5, 15), title: 'Title', picSetId: 1,
      picArray: [{ url: 'http://www.kcna.kp/1.jpg', savePath: '/tmp/1.jpg', date: new Date(2024, 5, 15) }],
    }]) })

    await uploadPicSetsKCNA()

    for (const [, update] of mockCollection.updateOne.mock.calls) expect(update.$set.tgChannelId).toBeUndefined()
  })

  it('escapes scraped HTML characters at the Telegram boundary', () => {
    const title = 'A < B & C > D'
    const picSet = { title, dateNormal: '06/15/2024', picSetId: 1, picArray: [{}], urlNormal: 'x&y' }
    const titleText = buildPicSetTitleText(picSet)

    expect(titleText).toContain('A &lt; B &amp; C &gt; D')
    expect(titleText).toContain('x&amp;y')
    expect(picSet.title).toBe(title)
  })
})
