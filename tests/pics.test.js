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
  tgPostPicFS: vi.fn(),
}))

vi.mock('../src/util/log.js', () => ({
  updateLogKCNA: vi.fn(),
}))

vi.mock('axios', () => ({ default: vi.fn() }))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual.default, createWriteStream: vi.fn(), rmSync: vi.fn() },
  }
})

import fs from 'fs'
import { PassThrough, Writable } from 'stream'
import axios from 'axios'
import kcnaState from '../src/util/state.js'
import { downloadPicsKCNA, downloadPicFS, postPicArrayTG, postPicTG } from '../src/kcna/pics.js'
import { dbGet } from '../middleware/db-config.js'
import { tgPostPicFS } from '../src/tg-api.js'

const getMockCollection = () => dbGet().collection()

// axios stream response: pushes chunks once downloadPicFS has attached its handlers
const streamResponse = (chunks) => {
  const source = new PassThrough()
  setImmediate(() => {
    for (const chunk of chunks) source.write(chunk)
    source.end()
  })
  return { data: source, headers: { 'content-type': 'image/jpeg' } }
}

const emptyResponse = () => streamResponse([])
const jpegResponse = (size) => streamResponse([Buffer.alloc(size, 1)])

beforeEach(() => {
  vi.clearAllMocks()
  kcnaState.scrapeActive = true

  fs.createWriteStream.mockImplementation(() => new Writable({ write(chunk, enc, cb) { cb() } }))
  fs.rmSync.mockImplementation(() => {})

  getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })
  getMockCollection().updateOne.mockResolvedValue({ modifiedCount: 1 })

  vi.spyOn(console, 'log').mockImplementation(() => {})
})

// ---- downloadPicFS ----

describe('downloadPicFS', () => {
  const url = 'http://www.kcna.kp/photo/abc123'
  const savePath = '/tmp/pics/kcna_pic_1.jpg'
  const picName = 'kcna_pic_1.jpg'

  it('returns null for missing args', async () => {
    expect(await downloadPicFS(null, savePath, picName)).toBeNull()
    expect(await downloadPicFS(url, null, picName)).toBeNull()
    expect(await downloadPicFS(url, savePath, null)).toBeNull()
    expect(axios).not.toHaveBeenCalled()
  })

  it('sends a Referer header so KCNA does not return an empty body', async () => {
    axios.mockImplementation(() => jpegResponse(2048))

    await downloadPicFS(url, savePath, picName)

    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'get',
        url: url,
        responseType: 'stream',
        headers: { Referer: process.env.KCNA_BASE_URL + '/' },
      })
    )
  })

  it('returns the download object with the byte count on success', async () => {
    axios.mockImplementation(() => jpegResponse(4096))

    const result = await downloadPicFS(url, savePath, picName)

    expect(result.downloadedSize).toBe(4096)
    expect(result.headers).toEqual({ 'content-type': 'image/jpeg' })
    expect(fs.rmSync).not.toHaveBeenCalled()
  })

  it('removes the file and retries once when the download is empty', async () => {
    axios.mockImplementation(() => emptyResponse())

    const result = await downloadPicFS(url, savePath, picName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(2)
    expect(fs.rmSync).toHaveBeenCalledWith(savePath, { force: true })
    expect(fs.rmSync).toHaveBeenCalledTimes(2)
  })

  it('returns the retry result when the first attempt is empty and the second has bytes', async () => {
    axios.mockImplementationOnce(() => emptyResponse()).mockImplementationOnce(() => jpegResponse(3072))

    const result = await downloadPicFS(url, savePath, picName)

    expect(axios).toHaveBeenCalledTimes(2)
    expect(result.downloadedSize).toBe(3072)
  })

  it('cleans up and retries once when axios throws, then returns null', async () => {
    axios.mockRejectedValue(new Error('socket hang up'))

    const result = await downloadPicFS(url, savePath, picName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(2)
    expect(fs.rmSync).toHaveBeenCalledTimes(2)
  })

  it('swallows a cleanup failure and still retries', async () => {
    axios.mockImplementation(() => emptyResponse())
    fs.rmSync.mockImplementation(() => {
      throw new Error('EPERM')
    })

    const result = await downloadPicFS(url, savePath, picName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(2)
  })

  it('does not retry when the scrape was stopped during the download', async () => {
    axios.mockImplementation(() => {
      kcnaState.scrapeActive = false
      return emptyResponse()
    })

    const result = await downloadPicFS(url, savePath, picName)

    expect(result).toBeNull()
    expect(axios).toHaveBeenCalledTimes(1)
  })

  it('returns null without calling axios when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false

    expect(await downloadPicFS(url, savePath, picName)).toBeNull()
    expect(axios).not.toHaveBeenCalled()
  })
})

// ---- downloadPicsKCNA ----

describe('downloadPicsKCNA', () => {
  const picDoc = (picId) => ({ picId, url: `http://www.kcna.kp/photo/pic${picId}` })

  it('stores nothing when the download returns null', async () => {
    getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([picDoc(1)]) })
    axios.mockImplementation(() => emptyResponse())

    const result = await downloadPicsKCNA()

    expect(result).toEqual([])
    expect(getMockCollection().updateOne).not.toHaveBeenCalled()
  })

  it('skips the failed pic and keeps going to the next one', async () => {
    getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([picDoc(1), picDoc(2)]) })
    axios
      .mockImplementationOnce(() => emptyResponse()) //pic 1, first attempt
      .mockImplementationOnce(() => emptyResponse()) //pic 1, retry
      .mockImplementationOnce(() => jpegResponse(5120)) //pic 2

    const result = await downloadPicsKCNA()

    expect(axios).toHaveBeenCalledTimes(3)
    expect(result).toHaveLength(1)
    expect(getMockCollection().updateOne).toHaveBeenCalledTimes(1)
    expect(getMockCollection().updateOne).toHaveBeenCalledWith(
      { url: 'http://www.kcna.kp/photo/pic2' },
      { $set: expect.objectContaining({ picSize: 5120, picName: 'kcna_pic_2.jpg' }) }
    )
  })
})

// ---- postPicArrayTG ----

describe('postPicArrayTG', () => {
  it('returns null for null/empty input', async () => {
    expect(await postPicArrayTG(null)).toBeNull()
    expect(await postPicArrayTG([])).toBeNull()
  })

  it('calls postPicTG for each pic and collects results', async () => {
    tgPostPicFS.mockResolvedValue({ ok: true })

    const pics = [
      { savePath: '/tmp/pics/1.jpg', caption: 'cap1', tgChannelId: '-1234' },
      { savePath: '/tmp/pics/2.jpg', caption: 'cap2', tgChannelId: '-1234' },
    ]

    const result = await postPicArrayTG(pics)
    expect(tgPostPicFS).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(2)
    expect(result[0].uploaded).toBe(true)
  })

  it('skips pics where postPicTG returns null', async () => {
    tgPostPicFS.mockResolvedValue(null)

    const pics = [{ savePath: '/tmp/1.jpg', caption: 'cap', tgChannelId: '-1234' }]
    const result = await postPicArrayTG(pics)
    expect(result).toHaveLength(0)
  })

  it('stops early when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false
    tgPostPicFS.mockResolvedValue({ ok: true })

    const pics = [
      { savePath: '/tmp/1.jpg', caption: 'cap1', tgChannelId: '-1234' },
      { savePath: '/tmp/2.jpg', caption: 'cap2', tgChannelId: '-1234' },
    ]
    const result = await postPicArrayTG(pics)
    // Should return early without processing any pics
    expect(tgPostPicFS).not.toHaveBeenCalled()
    expect(result).toEqual([])
  })
})

// ---- postPicTG ----

describe('postPicTG', () => {
  it('returns null for falsy input', async () => {
    expect(await postPicTG(null)).toBeNull()
  })

  it('calls tgPostPicFS with correct params', async () => {
    tgPostPicFS.mockResolvedValue({ ok: true, result: { message_id: 10 } })
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await postPicTG({
      savePath: '/tmp/pics/kcna_pic_1.jpg',
      caption: '<b>PIC 1 OF 3</b>',
      tgChannelId: '-1001234567890',
    })

    expect(tgPostPicFS).toHaveBeenCalledWith({
      chatId: '-1001234567890',
      savePath: '/tmp/pics/kcna_pic_1.jpg',
      caption: '<b>PIC 1 OF 3</b>',
      mode: 'html',
    })
    expect(result).toEqual({ ok: true, result: { message_id: 10 } })
    consoleSpy.mockRestore()
  })

  it('returns null when tgPostPicFS returns null', async () => {
    tgPostPicFS.mockResolvedValue(null)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await postPicTG({
      savePath: '/tmp/1.jpg',
      caption: 'cap',
      tgChannelId: '-1234',
    })
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })
})
