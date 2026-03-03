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

import axios from 'axios'
import kcnaState from '../src/util/state.js'
import { postPicArrayTG, postPicTG } from '../src/kcna/pics.js'
import { tgPostPicFS } from '../src/tg-api.js'

beforeEach(() => {
  vi.clearAllMocks()
  kcnaState.scrapeActive = true
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
