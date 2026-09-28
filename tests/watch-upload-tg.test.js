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

vi.mock('../src/tg-api.js', () => ({
  tgSendMessage: vi.fn(),
  tgPostVidFS: vi.fn(),
}))

vi.mock('../src/watch/chunk-vids.js', () => ({
  buildVidChunks: vi.fn(),
  removeVidChunks: vi.fn(),
}))

vi.mock('../src/watch/vid-message.js', () => ({
  buildVidTitleText: vi.fn(() => '<title text>'),
  buildVidCaptionText: vi.fn((inputObj, partIndex, partCount) =>
    partCount > 1 ? `<caption> | Part ${partIndex} of ${partCount}` : '<caption>'
  ),
}))

vi.mock('../src/util/log.js', () => ({
  updateLogKCNA: vi.fn(),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual.default, existsSync: vi.fn(), rmSync: vi.fn() },
  }
})

import fs from 'fs'
import kcnaState from '../src/util/state.js'
import { uploadVidsTGWatch, postVidTG } from '../src/watch/upload-tg.js'
import { dbGet } from '../middleware/db-config.js'
import { updateLogKCNA } from '../src/util/log.js'
import { tgSendMessage, tgPostVidFS } from '../src/tg-api.js'
import { buildVidChunks, removeVidChunks } from '../src/watch/chunk-vids.js'
import { buildVidCaptionText } from '../src/watch/vid-message.js'

const getMockCollection = () => dbGet().collection()

const buildChunkPaths = (count, prefix = '/tmp/watch/tg/vid.part') =>
  Array.from({ length: count }, (_, i) => `${prefix}${i + 1}.mp4`)

beforeEach(() => {
  vi.clearAllMocks()
  kcnaState.scrapeActive = true
  kcnaState.scrapeId = 'test-scrape-id'

  getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })
  getMockCollection().updateOne.mockResolvedValue({ acknowledged: true, matchedCount: 1 })
  fs.existsSync.mockReturnValue(true)
  tgSendMessage.mockResolvedValue({ ok: true })
  tgPostVidFS.mockResolvedValue({ ok: true })

  vi.spyOn(console, 'log').mockImplementation(() => {})
})

// ---- uploadVidsTGWatch ----

describe('uploadVidsTGWatch', () => {
  const vidRow = (url, overrides = {}) => ({
    url,
    savePath: `/tmp/watch/${url.split('/').pop()}.mp4`,
    vidName: `${url.split('/').pop()}.mp4`,
    vidPageId: 1,
    vidType: 'news8pm',
    title: 'Test broadcast',
    date: new Date('2026-07-19T00:00:00Z'),
    ...overrides,
  })

  it('throws when WATCH_PATH is unset', async () => {
    const original = process.env.WATCH_PATH
    delete process.env.WATCH_PATH

    try {
      await expect(uploadVidsTGWatch()).rejects.toThrow('WATCH_PATH')
    } finally {
      process.env.WATCH_PATH = original
    }
  })

  it('returns null without querying the db when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false

    const result = await uploadVidsTGWatch()

    expect(result).toBeNull()
    expect(getMockCollection().find).not.toHaveBeenCalled()
  })

  it('returns null when there is nothing to upload', async () => {
    getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })

    const result = await uploadVidsTGWatch()

    expect(result).toBeNull()
  })

  it('queries findEmptyItems for vidSize present / uploaded empty and uses the watch collection', async () => {
    getMockCollection().find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })

    await uploadVidsTGWatch()

    expect(dbGet().collection).toHaveBeenCalledWith('watch')
    expect(getMockCollection().find).toHaveBeenCalledWith(
      expect.objectContaining({ vidSize: { $exists: true } })
    )
  })

  it('uploads oldest vid first regardless of array order', async () => {
    buildVidChunks.mockResolvedValue(['/tmp/watch/tg/a.mp4'])
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        vidRow('https://kcnawatch.org/newer', { date: new Date('2026-07-20T00:00:00Z'), vidPageId: 2 }),
        vidRow('https://kcnawatch.org/older', { date: new Date('2026-07-18T00:00:00Z'), vidPageId: 1 }),
      ]),
    })

    await uploadVidsTGWatch()

    expect(tgSendMessage.mock.invocationCallOrder[0]).toBeLessThan(tgSendMessage.mock.invocationCallOrder[1])
    // first title sent must be for the older vid
    const firstCallArgs = buildVidChunks.mock.calls[0]
    expect(firstCallArgs[0]).toContain('older')
  })

  it('breaks ties on the same date by ascending vidPageId', async () => {
    buildVidChunks.mockResolvedValue(['/tmp/watch/tg/a.mp4'])
    const sameDate = new Date('2026-07-19T00:00:00Z')
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        vidRow('https://kcnawatch.org/second', { date: sameDate, vidPageId: 5 }),
        vidRow('https://kcnawatch.org/first', { date: sameDate, vidPageId: 2 }),
      ]),
    })

    await uploadVidsTGWatch()

    expect(buildVidChunks.mock.calls[0][0]).toContain('first')
    expect(buildVidChunks.mock.calls[1][0]).toContain('second')
  })

  it('runs the full happy path: sends title, uploads chunks, stores uploaded:true, updates log', async () => {
    buildVidChunks.mockResolvedValue(buildChunkPaths(3))
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([vidRow('https://kcnawatch.org/v1')]),
    })

    const result = await uploadVidsTGWatch()

    expect(tgSendMessage).toHaveBeenCalledTimes(1)
    expect(tgPostVidFS).toHaveBeenCalledTimes(3)
    expect(tgPostVidFS).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ savePath: buildChunkPaths(3)[0], caption: '<caption> | Part 1 of 3' })
    )
    expect(tgPostVidFS).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ savePath: buildChunkPaths(3)[1], caption: undefined })
    )
    expect(removeVidChunks).toHaveBeenCalledWith(buildChunkPaths(3), expect.stringContaining('v1'))
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/watch/tg/1', { recursive: true, force: true })
    expect(fs.rmSync).not.toHaveBeenCalledWith('/tmp/watch', expect.anything())
    expect(fs.rmSync).not.toHaveBeenCalledWith('/tmp/watch/tg', expect.anything())
    expect(getMockCollection().updateOne).toHaveBeenCalledWith(
      { url: 'https://kcnawatch.org/v1' },
      { $set: expect.objectContaining({ uploaded: true }) }
    )
    expect(result).toEqual([expect.objectContaining({ uploaded: true, url: 'https://kcnawatch.org/v1' })])
    expect(updateLogKCNA).toHaveBeenCalled()
  })

  it('does not mark the vid uploaded and sends no group when buildVidChunks resolves null', async () => {
    buildVidChunks.mockResolvedValue(null)
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([vidRow('https://kcnawatch.org/v1')]),
    })

    const result = await uploadVidsTGWatch()

    expect(tgPostVidFS).not.toHaveBeenCalled()
    expect(removeVidChunks).not.toHaveBeenCalled()
    expect(fs.rmSync).not.toHaveBeenCalled()
    expect(result).toEqual([])
    for (const [, update] of getMockCollection().updateOne.mock.calls) {
      expect(update.$set.uploaded).toBeUndefined()
    }
  })

  it('does not persist runtime-only tgChannelId/watchPath on the final update', async () => {
    buildVidChunks.mockResolvedValue(['/tmp/watch/tg/a.mp4'])
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([vidRow('https://kcnawatch.org/v1')]),
    })

    await uploadVidsTGWatch()

    for (const [, update] of getMockCollection().updateOne.mock.calls) {
      expect(update.$set.tgChannelId).toBeUndefined()
      expect(update.$set.watchPath).toBeUndefined()
    }
  })

  it('leaves a vid retryable (not uploaded) when the final Mongo update is rejected', async () => {
    buildVidChunks.mockResolvedValue(['/tmp/watch/tg/a.mp4'])
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([vidRow('https://kcnawatch.org/v1')]),
    })
    getMockCollection().updateOne
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1 }) // titleSent progress
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1 }) // chunk progress
      .mockResolvedValueOnce({ acknowledged: true, matchedCount: 1 }) // chunksSent progress
      .mockRejectedValueOnce(new Error('mongo down')) // final uploaded:true write

    const result = await uploadVidsTGWatch()

    expect(result).toEqual([])
  })

  it('sets the scrapeMessage to the finished-upload count but does not set scrapeStep', async () => {
    buildVidChunks.mockResolvedValue(['/tmp/watch/tg/a.mp4'])
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([vidRow('https://kcnawatch.org/v1')]),
    })
    kcnaState.scrapeStep = 'VID UPLOAD TG WATCH'

    await uploadVidsTGWatch()

    expect(kcnaState.scrapeMessage).toBe('FINISHED UPLOADING 1 NEW VIDS TO TG')
    expect(kcnaState.scrapeStep).toBe('VID UPLOAD TG WATCH')
  })

  it('stops before processing the second vid once scrapeActive flips false after the first upload', async () => {
    buildVidChunks.mockResolvedValue(['/tmp/watch/tg/a.mp4'])
    getMockCollection().find.mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        vidRow('https://kcnawatch.org/v1', { date: new Date('2026-07-18T00:00:00Z'), vidPageId: 1 }),
        vidRow('https://kcnawatch.org/v2', { date: new Date('2026-07-19T00:00:00Z'), vidPageId: 2 }),
      ]),
    })
    tgSendMessage.mockImplementation(async () => {
      kcnaState.scrapeActive = false
      return { ok: true }
    })

    const result = await uploadVidsTGWatch()

    expect(tgSendMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual([])
  })
})

// ---- postVidTG ----

describe('postVidTG', () => {
  const baseInput = (overrides = {}) => ({
    savePath: '/tmp/watch/vid.mp4',
    vidName: 'vid.mp4',
    title: 'Test broadcast',
    date: new Date('2026-07-19T00:00:00Z'),
    url: 'https://kcnawatch.org/v1',
    tgChannelId: '-100999',
    watchPath: '/tmp/watch',
    ...overrides,
  })

  it('returns false when a required field is missing', async () => {
    expect(await postVidTG(null)).toBe(false)
    expect(await postVidTG({ ...baseInput(), savePath: undefined })).toBe(false)
    expect(tgSendMessage).not.toHaveBeenCalled()
  })

  it('sends the title once via tgSendMessage with chat_id/text/parse_mode', async () => {
    buildVidChunks.mockResolvedValue(['/tmp/watch/tg/a.mp4'])

    await postVidTG(baseInput())

    expect(tgSendMessage).toHaveBeenCalledWith({
      chat_id: '-100999',
      text: '<title text>',
      parse_mode: 'HTML',
    })
  })

  it('sends a single chunk (already under the size limit) as one tgPostVidFS call with a caption and no Part suffix', async () => {
    buildVidChunks.mockResolvedValue(['/tmp/watch/tg/a.mp4'])

    const result = await postVidTG(baseInput())

    expect(result).toBe(true)
    expect(tgPostVidFS).toHaveBeenCalledTimes(1)
    expect(tgPostVidFS).toHaveBeenCalledWith(
      expect.objectContaining({ savePath: '/tmp/watch/tg/a.mp4', mode: 'HTML', caption: '<caption>' })
    )
    expect(tgPostVidFS.mock.calls[0][0].caption).not.toMatch(/Part/)
    expect(removeVidChunks).toHaveBeenCalledWith(['/tmp/watch/tg/a.mp4'], '/tmp/watch/vid.mp4')
    expect(fs.rmSync).toHaveBeenCalledWith('/tmp/watch/tg/vid', { recursive: true, force: true })
    expect(fs.rmSync).not.toHaveBeenCalledWith('/tmp/watch', expect.anything())
    expect(fs.rmSync).not.toHaveBeenCalledWith('/tmp/watch/tg', expect.anything())
  })

  it('sends every chunk sequentially in play order, captioning only the first', async () => {
    const chunks = buildChunkPaths(4)
    buildVidChunks.mockResolvedValue(chunks)
    const storeProgress = vi.fn().mockResolvedValue(true)

    const result = await postVidTG(baseInput(), storeProgress)

    expect(result).toBe(true)
    expect(tgPostVidFS).toHaveBeenCalledTimes(4)
    for (let i = 0; i < chunks.length; i++) {
      expect(tgPostVidFS).toHaveBeenNthCalledWith(i + 1, expect.objectContaining({ savePath: chunks[i] }))
    }

    expect(tgPostVidFS.mock.calls[0][0].caption).toContain('Part 1 of 4')
    expect(tgPostVidFS.mock.calls[1][0].caption).toBeUndefined()
    expect(tgPostVidFS.mock.calls[2][0].caption).toBeUndefined()
    expect(tgPostVidFS.mock.calls[3][0].caption).toBeUndefined()
    expect(buildVidCaptionText).toHaveBeenCalledTimes(1)
    expect(buildVidCaptionText).toHaveBeenCalledWith(expect.anything(), 1, 4)

    const chunksSentValues = storeProgress.mock.calls.map((call) => call[0].chunksSent).filter((v) => v > 0)
    expect(chunksSentValues).toEqual([1, 2, 3, 4])
  })

  it('resumes without resending the title or rebuilding chunks when progress already has them', async () => {
    const chunks = buildChunkPaths(3)
    fs.existsSync.mockReturnValue(true)

    const result = await postVidTG(
      baseInput({ telegramDelivery: { titleSent: true, chunkPathArray: chunks, chunksSent: 0 } })
    )

    expect(result).toBe(true)
    expect(tgSendMessage).not.toHaveBeenCalled()
    expect(buildVidChunks).not.toHaveBeenCalled()
    expect(tgPostVidFS).toHaveBeenCalledTimes(3)
  })

  it('resumes from a stored chunksSent, sending only the remaining chunks with no caption', async () => {
    const chunks = buildChunkPaths(4)
    fs.existsSync.mockReturnValue(true)
    const storeProgress = vi.fn().mockResolvedValue(true)

    const result = await postVidTG(
      baseInput({ telegramDelivery: { titleSent: true, chunkPathArray: chunks, chunksSent: 2 } }),
      storeProgress
    )

    expect(result).toBe(true)
    expect(tgPostVidFS).toHaveBeenCalledTimes(2)
    expect(tgPostVidFS).toHaveBeenNthCalledWith(1, expect.objectContaining({ savePath: chunks[2], caption: undefined }))
    expect(tgPostVidFS).toHaveBeenNthCalledWith(2, expect.objectContaining({ savePath: chunks[3], caption: undefined }))
    expect(buildVidCaptionText).not.toHaveBeenCalled()

    const chunksSentValues = storeProgress.mock.calls.map((call) => call[0].chunksSent).filter((v) => v > 0)
    expect(chunksSentValues).toEqual([3, 4])
  })

  it('rebuilds chunks when a stored chunk path no longer exists on disk', async () => {
    const staleChunks = buildChunkPaths(2, '/tmp/watch/tg/stale.part')
    const freshChunks = buildChunkPaths(2, '/tmp/watch/tg/fresh.part')
    fs.existsSync.mockReturnValue(false)
    buildVidChunks.mockResolvedValue(freshChunks)

    const result = await postVidTG(
      baseInput({ telegramDelivery: { titleSent: true, chunkPathArray: staleChunks, chunksSent: 0 } })
    )

    expect(result).toBe(true)
    expect(buildVidChunks).toHaveBeenCalledWith('/tmp/watch/vid.mp4', '/tmp/watch/tg/vid', 'vid')
    expect(tgPostVidFS).toHaveBeenCalledWith(expect.objectContaining({ savePath: freshChunks[0] }))
    expect(tgPostVidFS).toHaveBeenCalledWith(expect.objectContaining({ savePath: freshChunks[1] }))
  })

  it('resets chunksSent when stale chunks are rebuilt, so the fresh chunks still get sent from the start', async () => {
    const staleChunks = buildChunkPaths(2, '/tmp/watch/tg/vid/stale.part')
    const freshChunks = buildChunkPaths(2, '/tmp/watch/tg/vid/fresh.part')
    fs.existsSync.mockReturnValue(false)
    buildVidChunks.mockResolvedValue(freshChunks)

    const result = await postVidTG(
      baseInput({ telegramDelivery: { titleSent: true, chunkPathArray: staleChunks, chunksSent: 1 } })
    )

    expect(result).toBe(true)
    expect(tgPostVidFS).toHaveBeenCalledTimes(2)
    expect(tgPostVidFS).toHaveBeenNthCalledWith(1, expect.objectContaining({ savePath: freshChunks[0] }))
    expect(tgPostVidFS).toHaveBeenNthCalledWith(2, expect.objectContaining({ savePath: freshChunks[1] }))
  })

  it('returns false and sends no chunk when buildVidChunks resolves null', async () => {
    buildVidChunks.mockResolvedValue(null)

    const result = await postVidTG(baseInput())

    expect(result).toBe(false)
    expect(tgPostVidFS).not.toHaveBeenCalled()
    expect(removeVidChunks).not.toHaveBeenCalled()
    expect(fs.rmSync).not.toHaveBeenCalled()
  })

  it('returns false and skips chunking entirely when the title send fails', async () => {
    tgSendMessage.mockResolvedValue(null)

    const result = await postVidTG(baseInput())

    expect(result).toBe(false)
    expect(buildVidChunks).not.toHaveBeenCalled()
    expect(tgPostVidFS).not.toHaveBeenCalled()
  })

  it('returns true without rebuilding or reposting when progress shows every chunk already sent', async () => {
    const goneChunks = buildChunkPaths(3, '/tmp/watch/tg/vid/gone.part')
    fs.existsSync.mockReturnValue(false)

    const result = await postVidTG(
      baseInput({ telegramDelivery: { titleSent: true, chunkPathArray: goneChunks, chunksSent: goneChunks.length } })
    )

    expect(result).toBe(true)
    expect(buildVidChunks).not.toHaveBeenCalled()
    expect(tgPostVidFS).not.toHaveBeenCalled()
    expect(tgSendMessage).not.toHaveBeenCalled()
  })

  it('returns false and skips chunking when scrapeActive flips false during the title send', async () => {
    tgSendMessage.mockImplementation(async () => {
      kcnaState.scrapeActive = false
      return { ok: true }
    })

    const result = await postVidTG(baseInput())

    expect(result).toBe(false)
    expect(buildVidChunks).not.toHaveBeenCalled()
    expect(tgPostVidFS).not.toHaveBeenCalled()
  })

  it('returns false and stops without exceeding chunksSent when a later chunk fails', async () => {
    const chunks = buildChunkPaths(4)
    buildVidChunks.mockResolvedValue(chunks)
    tgPostVidFS
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(null)
    const storeProgress = vi.fn().mockResolvedValue(true)

    const result = await postVidTG(baseInput(), storeProgress)

    expect(result).toBe(false)
    expect(tgPostVidFS).toHaveBeenCalledTimes(3)
    const chunksSentValues = storeProgress.mock.calls.map((call) => call[0].chunksSent).filter((v) => v > 0)
    expect(chunksSentValues).toEqual([1, 2])
    expect(removeVidChunks).not.toHaveBeenCalled()
    expect(fs.rmSync).not.toHaveBeenCalled()
  })

  it('stops mid-loop and returns false once scrapeActive flips false after an earlier chunk succeeds', async () => {
    const chunks = buildChunkPaths(4)
    buildVidChunks.mockResolvedValue(chunks)
    tgPostVidFS.mockImplementation(async () => {
      kcnaState.scrapeActive = false
      return { ok: true }
    })

    const result = await postVidTG(baseInput())

    expect(result).toBe(false)
    expect(tgPostVidFS).toHaveBeenCalledTimes(1)
    expect(removeVidChunks).not.toHaveBeenCalled()
    expect(fs.rmSync).not.toHaveBeenCalled()
  })
})
