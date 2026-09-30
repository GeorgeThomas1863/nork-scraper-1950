import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCollection } = vi.hoisted(() => ({
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

vi.mock('../src/util/log.js', () => ({
  updateLogKCNA: vi.fn(),
}))

vi.mock('axios', () => ({ default: vi.fn() }))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual.default, createWriteStream: vi.fn(), rmSync: vi.fn(), mkdirSync: vi.fn(), writeFileSync: vi.fn() },
  }
})

import fs from 'fs'
import { PassThrough, Writable } from 'stream'
import axios from 'axios'
import kcnaState from '../src/util/state.js'
import { uploadVidPagesWatch, downloadVidsWatch, downloadVidFS, downloadThumbsWatch, downloadThumbFS } from '../src/watch/vids.js'
import { dbGet } from '../middleware/db-config.js'
import { updateLogKCNA } from '../src/util/log.js'

const getMockCollection = () => dbGet().collection()

// axios stream response: pushes chunks once downloadVidFS has attached its handlers
const streamResponse = (chunks, headers = {}) => {
  const source = new PassThrough()
  setImmediate(() => {
    for (const chunk of chunks) source.write(chunk)
    source.end()
  })
  return { data: source, headers }
}

const emptyResponse = () => streamResponse([], { 'content-length': '0' })
const vidResponse = (size, headerOverrides = {}) =>
  streamResponse([Buffer.alloc(size, 1)], { 'content-length': String(size), ...headerOverrides })

beforeEach(() => {
  vi.clearAllMocks()
  kcnaState.scrapeActive = true
  kcnaState.scrapeId = 'test-scrape-id'

  fs.createWriteStream.mockImplementation(() => new Writable({ write(chunk, enc, cb) { cb() } }))
  fs.rmSync.mockImplementation(() => {})
  fs.mkdirSync.mockImplementation(() => {})
  fs.writeFileSync.mockImplementation(() => {})

  getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })
  getMockCollection().updateOne.mockResolvedValue({ modifiedCount: 1 })
  getMockCollection().insertOne.mockResolvedValue({ acknowledged: true, insertedId: 'abc' })

  vi.spyOn(console, 'log').mockImplementation(() => {})
})

// ---- downloadVidFS ----

describe('downloadVidFS', () => {
  const url = 'https://kcnawatch.org/kctv-video/abc123.mp4'
  const savePath = 'C:/tmp/watch/kctv_2026-07-19_news8pm.mp4'
  const vidName = 'kctv_2026-07-19_news8pm.mp4'

  it('returns null for missing args', async () => {
    expect(await downloadVidFS(null, savePath, vidName)).toBeNull()
    expect(await downloadVidFS(url, null, vidName)).toBeNull()
    expect(await downloadVidFS(url, savePath, null)).toBeNull()
    expect(axios).not.toHaveBeenCalled()
  })

  it('sends a browser User-Agent and kcnawatch.org Referer with a 2 minute timeout', async () => {
    axios.mockImplementation(() => vidResponse(2048))

    await downloadVidFS(url, savePath, vidName)

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'get',
        url: url,
        responseType: 'stream',
        timeout: 120000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
          Referer: 'https://kcnawatch.org/',
        },
      })
    )
  })

  it('returns the download object with the byte count on success', async () => {
    axios.mockImplementation(() => vidResponse(4096))

    const result = await downloadVidFS(url, savePath, vidName)

    expect(result.downloadedSize).toBe(4096)
    expect(fs.rmSync).not.toHaveBeenCalled()
  })

  it('removes the file and retries once when the download is empty', async () => {
    axios.mockImplementation(() => emptyResponse())

    const result = await downloadVidFS(url, savePath, vidName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(2)
    expect(fs.rmSync).toHaveBeenCalledWith(savePath, { force: true })
    expect(fs.rmSync).toHaveBeenCalledTimes(2)
  })

  it('removes the file and retries once when downloaded bytes do not match content-length', async () => {
    axios.mockImplementation(() => vidResponse(4096, { 'content-length': '9999' }))

    const result = await downloadVidFS(url, savePath, vidName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(2)
    expect(fs.rmSync).toHaveBeenCalledTimes(2)
  })

  it('returns the retry result when the first attempt mismatches and the second is clean', async () => {
    axios
      .mockImplementationOnce(() => vidResponse(4096, { 'content-length': '9999' }))
      .mockImplementationOnce(() => vidResponse(3072))

    const result = await downloadVidFS(url, savePath, vidName)

    expect(axios).toHaveBeenCalledTimes(2)
    expect(result.downloadedSize).toBe(3072)
  })

  it('cleans up and retries once when axios rejects (e.g. non-2xx status), then returns null', async () => {
    axios.mockRejectedValue(new Error('Request failed with status code 404'))

    const result = await downloadVidFS(url, savePath, vidName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(2)
    expect(fs.rmSync).toHaveBeenCalledTimes(2)
  })

  it('cleans up and retries once when the response stream errors mid-download, then returns null', async () => {
    axios.mockImplementation(() => {
      const source = new PassThrough()
      setImmediate(() => {
        source.write(Buffer.alloc(512, 1))
        source.destroy(new Error('read ECONNRESET'))
      })
      return { data: source, headers: { 'content-length': '4096' } }
    })

    const result = await downloadVidFS('http://x/v.mp4', '/tmp/v.mp4', 'v.mp4')

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(2)
    expect(fs.rmSync).toHaveBeenCalledTimes(2)
  })

  it('swallows a cleanup failure and still retries', async () => {
    axios.mockImplementation(() => emptyResponse())
    fs.rmSync.mockImplementation(() => {
      throw new Error('EPERM')
    })

    const result = await downloadVidFS(url, savePath, vidName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(2)
  })

  it('settles (does not hang) and does not retry when the scrape is stopped mid-stream', async () => {
    // real chunk data so the "data" handler actually fires and takes the abort branch;
    // a regression here (destroy() without settling the promise) would hang until the
    // test's own timeout below fails it, rather than resolving to null
    axios.mockImplementation(() => {
      kcnaState.scrapeActive = false
      return vidResponse(2048)
    })

    const result = await downloadVidFS(url, savePath, vidName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(1)
    expect(fs.rmSync).toHaveBeenCalledWith(savePath, { force: true })
  }, 2000)

  it('returns null without calling axios when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false

    expect(await downloadVidFS(url, savePath, vidName)).toBeNull()
    expect(axios).not.toHaveBeenCalled()
  })
})

// ---- downloadVidsWatch ----

describe('downloadVidsWatch', () => {
  const vidRow = (url, date, vidType) => ({ url, date, vidType })

  it('throws when WATCH_PATH is unset', async () => {
    const original = process.env.WATCH_PATH
    delete process.env.WATCH_PATH

    try {
      await expect(downloadVidsWatch()).rejects.toThrow('WATCH_PATH')
    } finally {
      process.env.WATCH_PATH = original
    }
  })

  it('does not hang and does not write vidSize when scrapeActive flips false mid-download', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([vidRow('https://kcnawatch.org/kctv/3.mp4', new Date('2026-07-19T00:00:00Z'), 'news5pm')]),
    })
    axios.mockImplementation(() => {
      kcnaState.scrapeActive = false
      return vidResponse(2048)
    })

    const result = await downloadVidsWatch()

    expect(result).toBe(0)
    expect(getMockCollection().updateOne).not.toHaveBeenCalled()
  }, 2000)

  it('returns 0 without querying the db when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false

    const result = await downloadVidsWatch()

    expect(result).toBe(0)
    expect(getMockCollection().find).not.toHaveBeenCalled()
  })

  it('returns 0 when there is nothing to download', async () => {
    getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })

    const result = await downloadVidsWatch()

    expect(result).toBe(0)
  })

  it('downloads a row, builds the kctv_<date>_<vidType>.mp4 filename from a UTC date, and stores vidSize/vidName/savePath', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([vidRow('https://kcnawatch.org/kctv/1.mp4', new Date('2026-07-19T23:30:00Z'), 'news8pm')]),
    })
    axios.mockImplementation(() => vidResponse(5120))

    const result = await downloadVidsWatch()

    expect(result).toBe(1)
    expect(dbGet().collection).toHaveBeenCalledWith('watch')
    expect(getMockCollection().updateOne).toHaveBeenCalledWith(
      { url: 'https://kcnawatch.org/kctv/1.mp4' },
      {
        $set: expect.objectContaining({
          vidSize: 5120,
          vidName: 'kctv_2026-07-19_news8pm.mp4',
        }),
      }
    )
    expect(updateLogKCNA).toHaveBeenCalled()
  })

  it('skips a row whose download fails after the retry and does not write vidSize', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([vidRow('https://kcnawatch.org/kctv/2.mp4', new Date('2026-07-19T00:00:00Z'), 'news5pm')]),
    })
    axios.mockImplementation(() => emptyResponse())

    const result = await downloadVidsWatch()

    expect(result).toBe(0)
    expect(getMockCollection().updateOne).not.toHaveBeenCalled()
  })

  it('stops before processing the second row once scrapeActive flips false after the first store', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        vidRow('https://kcnawatch.org/kctv/1.mp4', new Date('2026-07-19T00:00:00Z'), 'news5pm'),
        vidRow('https://kcnawatch.org/kctv/2.mp4', new Date('2026-07-19T00:00:00Z'), 'news8pm'),
      ]),
    })
    axios.mockImplementation(() => vidResponse(1024))
    getMockCollection().updateOne.mockImplementation(async () => {
      kcnaState.scrapeActive = false // scrape gets stopped right after the first row is stored
      return { modifiedCount: 1 }
    })

    const result = await downloadVidsWatch()

    expect(axios).toHaveBeenCalledTimes(1)
    expect(result).toBe(1)
  })

  const PLACEHOLDER_URL = 'https://kcnawatch.org/wp-content/themes/kcnawatch/images/image-uploading.mp4'
  const stuckPlaceholderRow = () => ({
    date: new Date('2026-09-29T00:00:00Z'),
    vidType: 'news5pm',
    vidPageId: 9,
    pageURL: 'https://kcnawatch.org/kctv-archive/6abbc4bece4c0',
    url: PLACEHOLDER_URL,
    thumbURL: '/wp-content/themes/kcnawatch/images/image-uploading.jpg',
  })

  it('deletes a placeholder-url row instead of downloading it', async () => {
    getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([stuckPlaceholderRow()]) })
    getMockCollection().deleteOne.mockResolvedValue({ deletedCount: 1 })

    const result = await downloadVidsWatch()

    expect(result).toBe(0)
    expect(getMockCollection().deleteOne).toHaveBeenCalledWith({ url: PLACEHOLDER_URL })
    expect(axios).not.toHaveBeenCalled()
    expect(getMockCollection().updateOne).not.toHaveBeenCalled()
  })

  it('deletes the placeholder row and still downloads a healthy row in the same run', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        stuckPlaceholderRow(),
        vidRow('https://streamer.nknews.org/kctv/healthy.mp4', new Date('2026-09-28T00:00:00Z'), 'news8pm'),
      ]),
    })
    getMockCollection().deleteOne.mockResolvedValue({ deletedCount: 1 })
    axios.mockImplementation(() => vidResponse(2048))

    const result = await downloadVidsWatch()

    expect(result).toBe(1)
    expect(getMockCollection().deleteOne).toHaveBeenCalledTimes(1)
    expect(getMockCollection().deleteOne).toHaveBeenCalledWith({ url: PLACEHOLDER_URL })
    expect(axios).toHaveBeenCalledTimes(1)
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://streamer.nknews.org/kctv/healthy.mp4' }))
    expect(getMockCollection().updateOne).toHaveBeenCalledWith(
      { url: 'https://streamer.nknews.org/kctv/healthy.mp4' },
      { $set: expect.objectContaining({ vidSize: 2048, vidName: 'kctv_2026-09-28_news8pm.mp4' }) }
    )
  })
})

// ---- downloadThumbFS ----

const thumbResponse = (size, headerOverrides = {}) => ({
  data: Buffer.alloc(size, 1),
  headers: { 'content-length': String(size), ...headerOverrides },
})

describe('downloadThumbFS', () => {
  const url = 'https://kcnawatch.org/kctv-video/abc123.jpg'
  const savePath = 'C:/tmp/watch/kctv_2026-07-19_news8pm.jpg'
  const thumbName = 'kctv_2026-07-19_news8pm.jpg'

  it('returns null for missing args', async () => {
    expect(await downloadThumbFS(null, savePath, thumbName)).toBeNull()
    expect(await downloadThumbFS(url, null, thumbName)).toBeNull()
    expect(await downloadThumbFS(url, savePath, null)).toBeNull()
    expect(axios).not.toHaveBeenCalled()
  })

  it('returns null without calling axios when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false

    expect(await downloadThumbFS(url, savePath, thumbName)).toBeNull()
    expect(axios).not.toHaveBeenCalled()
  })

  it('sends the same User-Agent and Referer headers as downloadVidFS with a 30 second timeout', async () => {
    axios.mockResolvedValue(thumbResponse(2048))

    await downloadThumbFS(url, savePath, thumbName)

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'get',
        url: url,
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
          Referer: 'https://kcnawatch.org/',
        },
      })
    )
  })

  it('writes the file and returns the byte count on success', async () => {
    axios.mockResolvedValue(thumbResponse(4096))

    const result = await downloadThumbFS(url, savePath, thumbName)

    expect(result.downloadedSize).toBe(4096)
    expect(fs.writeFileSync).toHaveBeenCalledWith(savePath, expect.any(Buffer))
    expect(fs.rmSync).not.toHaveBeenCalled()
  })

  it('removes the file and returns null without retrying when the body is empty', async () => {
    axios.mockResolvedValue(thumbResponse(0))

    const result = await downloadThumbFS(url, savePath, thumbName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(1)
    expect(fs.writeFileSync).not.toHaveBeenCalled()
    expect(fs.rmSync).toHaveBeenCalledWith(savePath, { force: true })
  })

  it('removes the file and returns null without retrying when axios rejects', async () => {
    axios.mockRejectedValue(new Error('Request failed with status code 404'))

    const result = await downloadThumbFS(url, savePath, thumbName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(1)
    expect(fs.rmSync).toHaveBeenCalledWith(savePath, { force: true })
  })
})

// ---- downloadThumbsWatch ----

describe('downloadThumbsWatch', () => {
  const thumbRow = (url, thumbURL, date, vidType) => ({ url, thumbURL, date, vidType })

  it('throws when WATCH_PATH is unset', async () => {
    const original = process.env.WATCH_PATH
    delete process.env.WATCH_PATH

    try {
      await expect(downloadThumbsWatch()).rejects.toThrow('WATCH_PATH')
    } finally {
      process.env.WATCH_PATH = original
    }
  })

  it('returns 0 without querying the db when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false

    const result = await downloadThumbsWatch()

    expect(result).toBe(0)
    expect(getMockCollection().find).not.toHaveBeenCalled()
  })

  it('returns 0 when there is nothing to download', async () => {
    getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })

    const result = await downloadThumbsWatch()

    expect(result).toBe(0)
  })

  it('downloads a row, builds the kctv_<date>_<vidType>.jpg filename from a UTC date, and stores thumbName/thumbPath/thumbSize', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue([
          thumbRow('https://kcnawatch.org/kctv/1', 'https://kcnawatch.org/kctv/1.jpg', new Date('2026-07-19T23:30:00Z'), 'news8pm'),
        ]),
    })
    axios.mockResolvedValue(thumbResponse(5120))

    const result = await downloadThumbsWatch()

    expect(result).toBe(1)
    expect(dbGet().collection).toHaveBeenCalledWith('watch')
    expect(getMockCollection().updateOne).toHaveBeenCalledWith(
      { url: 'https://kcnawatch.org/kctv/1' },
      {
        $set: expect.objectContaining({
          thumbName: 'kctv_2026-07-19_news8pm.jpg',
          thumbSize: 5120,
        }),
      }
    )
    expect(updateLogKCNA).toHaveBeenCalled()
  })

  it('skips a row whose thumbnail download rejects and does not update it', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue([
          thumbRow('https://kcnawatch.org/kctv/2', 'https://kcnawatch.org/kctv/2.jpg', new Date('2026-07-19T00:00:00Z'), 'news5pm'),
        ]),
    })
    axios.mockRejectedValue(new Error('Request failed with status code 404'))

    const result = await downloadThumbsWatch()

    expect(result).toBe(0)
    expect(getMockCollection().updateOne).not.toHaveBeenCalled()
  })

  it('skips a row whose thumbnail body is empty and does not update it', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi
        .fn()
        .mockResolvedValue([
          thumbRow('https://kcnawatch.org/kctv/3', 'https://kcnawatch.org/kctv/3.jpg', new Date('2026-07-19T00:00:00Z'), 'news5pm'),
        ]),
    })
    axios.mockResolvedValue(thumbResponse(0))

    const result = await downloadThumbsWatch()

    expect(result).toBe(0)
    expect(getMockCollection().updateOne).not.toHaveBeenCalled()
  })

  it('stops before processing the second row once scrapeActive flips false after the first store', async () => {
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        thumbRow('https://kcnawatch.org/kctv/1', 'https://kcnawatch.org/kctv/1.jpg', new Date('2026-07-19T00:00:00Z'), 'news5pm'),
        thumbRow('https://kcnawatch.org/kctv/2', 'https://kcnawatch.org/kctv/2.jpg', new Date('2026-07-19T00:00:00Z'), 'news8pm'),
      ]),
    })
    axios.mockResolvedValue(thumbResponse(1024))
    getMockCollection().updateOne.mockImplementation(async () => {
      kcnaState.scrapeActive = false // scrape gets stopped right after the first row is stored
      return { modifiedCount: 1 }
    })

    const result = await downloadThumbsWatch()

    expect(axios).toHaveBeenCalledTimes(1)
    expect(result).toBe(1)
  })
})

// ---- uploadVidPagesWatch ----

describe('uploadVidPagesWatch', () => {
  const entry = (url, overrides = {}) => ({
    url,
    pageURL: `${url}/page`,
    thumbURL: `${url}/thumb.jpg`,
    date: new Date('2026-07-19T00:00:00Z'),
    vidType: 'news8pm',
    title: 'Test broadcast',
    site: 'watch',
    ...overrides,
  })

  const mockCounterFlow = (nextSeq) => {
    getMockCollection().findOneAndUpdate.mockResolvedValue({ seq: nextSeq })
  }

  it('returns 0 for a null/empty entry array', async () => {
    expect(await uploadVidPagesWatch(null)).toBe(0)
    expect(await uploadVidPagesWatch([])).toBe(0)
    expect(getMockCollection().insertOne).not.toHaveBeenCalled()
  })

  it('returns 0 without touching the db when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false

    const result = await uploadVidPagesWatch([entry('https://kcnawatch.org/v1')])

    expect(result).toBe(0)
    expect(getMockCollection().findOne).not.toHaveBeenCalled()
  })

  it('stores a new entry, stamping scrapeId and a numeric vidPageId', async () => {
    getMockCollection().findOne.mockImplementation(async (query) => {
      if ('url' in query) return null // not stored yet
      return { seq: 40 } // counters doc already seeded
    })
    mockCounterFlow(41)

    const result = await uploadVidPagesWatch([entry('https://kcnawatch.org/v1')])

    expect(result).toBe(1)
    expect(dbGet().collection).toHaveBeenCalledWith('watch')
    expect(getMockCollection().findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'watch' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' }
    )
    expect(getMockCollection().insertOne).toHaveBeenCalledTimes(1)
    expect(getMockCollection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://kcnawatch.org/v1',
        scrapeId: 'test-scrape-id',
        vidPageId: 41,
        vidType: 'news8pm',
        site: 'watch',
      })
    )
    expect(updateLogKCNA).toHaveBeenCalled()
  })

  it('seeds a missing watch counter from the highest existing vidPageId', async () => {
    getMockCollection().findOne.mockResolvedValue(null)
    const toArray = vi.fn().mockResolvedValue([{ vidPageId: 42 }])
    const limit = vi.fn().mockReturnValue({ toArray })
    const sort = vi.fn().mockReturnValue({ limit })
    getMockCollection().find.mockReturnValue({ sort })
    getMockCollection().findOneAndUpdate.mockResolvedValue({ seq: 43 })

    const result = await uploadVidPagesWatch([entry('https://kcnawatch.org/v1')])

    expect(result).toBe(1)
    expect(sort).toHaveBeenCalledWith({ vidPageId: -1 })
    expect(getMockCollection().updateOne).toHaveBeenCalledWith(
      { _id: 'watch' },
      { $setOnInsert: { seq: 42 } },
      { upsert: true }
    )
    expect(getMockCollection().findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'watch' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' }
    )
    expect(getMockCollection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ vidPageId: 43 })
    )
  })

  it('skips an entry whose url already exists and does not advance the counter or insert', async () => {
    getMockCollection().findOne.mockImplementation(async (query) => {
      if ('url' in query) return { url: query.url } // already stored
      return { seq: 40 }
    })

    const result = await uploadVidPagesWatch([entry('https://kcnawatch.org/v1')])

    expect(result).toBe(0)
    expect(getMockCollection().insertOne).not.toHaveBeenCalled()
    expect(getMockCollection().findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('stores new entries and skips existing ones in the same batch', async () => {
    const existingUrls = new Set(['https://kcnawatch.org/existing'])
    getMockCollection().findOne.mockImplementation(async (query) => {
      if ('url' in query) return existingUrls.has(query.url) ? { url: query.url } : null
      return { seq: 40 }
    })
    mockCounterFlow(41)

    const result = await uploadVidPagesWatch([
      entry('https://kcnawatch.org/existing'),
      entry('https://kcnawatch.org/new'),
    ])

    expect(result).toBe(1)
    expect(getMockCollection().insertOne).toHaveBeenCalledTimes(1)
    expect(getMockCollection().insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://kcnawatch.org/new' })
    )
  })

  it('stops before processing the second entry once scrapeActive flips false after the first is stored', async () => {
    getMockCollection().findOne.mockImplementation(async (query) => {
      if ('url' in query) return null // neither entry exists yet
      return { seq: 40 }
    })
    mockCounterFlow(41)
    getMockCollection().insertOne.mockImplementation(async () => {
      kcnaState.scrapeActive = false // scrape gets stopped right after the first entry is stored
      return { acknowledged: true }
    })

    const result = await uploadVidPagesWatch([
      entry('https://kcnawatch.org/v1'),
      entry('https://kcnawatch.org/v2'),
    ])

    expect(result).toBe(1)
    expect(getMockCollection().insertOne).toHaveBeenCalledTimes(1)
  })
})
