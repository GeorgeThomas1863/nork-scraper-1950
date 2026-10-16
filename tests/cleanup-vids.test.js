import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { rowStore } = vi.hoisted(() => ({ rowStore: { rows: [] } }))

// minimal in-memory collection: supports the filter operators the real queries use
const readPath = (row, dottedKey) => dottedKey.split('.').reduce((value, key) => value?.[key], row)

const matchesCondition = (value, condition) => {
  const isOperatorObj = condition && typeof condition === 'object' && !(condition instanceof Date)
  if (!isOperatorObj) return value === condition
  if ('$exists' in condition) return (value !== undefined) === condition.$exists
  if ('$lt' in condition) return value instanceof Date && value < condition.$lt
  if ('$ne' in condition) return value !== condition.$ne
  return false
}

const matchesFilter = (row, filter) => {
  for (const [key, condition] of Object.entries(filter)) {
    if (key === '$or') {
      if (!condition.some((subFilter) => matchesFilter(row, subFilter))) return false
      continue
    }
    if (!matchesCondition(readPath(row, key), condition)) return false
  }
  return true
}

const { mockCollection } = vi.hoisted(() => ({
  mockCollection: {
    find: vi.fn((filter) => ({ toArray: async () => rowStore.rows.filter((row) => matchesFilter(row, filter)) })),
    updateOne: vi.fn(async (filter, update) => {
      const row = rowStore.rows.find((candidate) => matchesFilter(candidate, filter))
      if (!row) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 }
      Object.assign(row, update.$set)
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 }
    }),
  },
}))

vi.mock('../middleware/db-config.js', () => {
  const mockDb = { collection: vi.fn(() => mockCollection) }
  return { dbGet: vi.fn(() => mockDb), dbConnect: vi.fn() }
})

import fs from 'fs'
import os from 'os'
import path from 'path'
import kcnaState from '../src/util/state.js'
import dbModel from '../models/db-model.js'
import { cleanupOldVidsWatch } from '../src/watch/cleanup-vids.js'

const DAY_MS = 24 * 60 * 60 * 1000
const completeDelivery = () => ({ titleSent: true, chunkPathArray: ['/x/a.mp4', '/x/b.mp4'], chunksSent: 2 })

let watchDir
let outsideDir

const daysAgo = (days) => new Date(Date.now() - days * DAY_MS)

const buildRow = (name, overrides = {}) => {
  const savePath = path.join(watchDir, `${name}.mp4`)
  const thumbPath = path.join(watchDir, `${name}.jpg`)
  fs.writeFileSync(savePath, Buffer.alloc(2048, 1))
  fs.writeFileSync(thumbPath, Buffer.alloc(64, 2))

  const row = {
    url: `https://streamer.nknews.org/${name}.mp4`,
    site: 'watch',
    date: daysAgo(30),
    vidType: 'news5pm',
    vidName: `${name}.mp4`,
    savePath,
    vidSize: 2048,
    thumbName: `${name}.jpg`,
    thumbPath,
    thumbSize: 64,
    uploaded: true,
    telegramDelivery: completeDelivery(),
    ...overrides,
  }
  rowStore.rows.push(row)
  return row
}

beforeEach(() => {
  vi.clearAllMocks()
  rowStore.rows = []
  watchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-watch-'))
  outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-outside-'))
  process.env.WATCH_COLLECTION = 'watch'
  process.env.WATCH_PATH = watchDir
  delete process.env.WATCH_KEEP_DAYS
  kcnaState.scrapeActive = true
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  fs.rmSync(watchDir, { recursive: true, force: true })
  fs.rmSync(outsideDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('cleanupOldVidsWatch', () => {
  it('deletes the mp4 of an old, fully delivered vid and marks the record without touching other fields', async () => {
    const row = buildRow('kctv_old')
    const before = { url: row.url, vidSize: row.vidSize, uploaded: row.uploaded, telegramDelivery: structuredClone(row.telegramDelivery) }

    const deletedCount = await cleanupOldVidsWatch()

    expect(deletedCount).toBe(1)
    expect(fs.existsSync(row.savePath)).toBe(false)
    expect(row.localDeleted).toBe(true)
    expect(row.localDeletedAt).toBeInstanceOf(Date)
    expect(row.url).toBe(before.url)
    expect(row.vidSize).toBe(before.vidSize)
    expect(row.uploaded).toBe(before.uploaded)
    expect(row.telegramDelivery).toEqual(before.telegramDelivery)
    expect(fs.existsSync(row.thumbPath)).toBe(true)
  })

  it('keeps old vids whose Telegram upload is incomplete', async () => {
    const incompleteRows = [
      buildRow('kctv_noflag', { uploaded: undefined }),
      buildRow('kctv_false', { uploaded: false }),
      buildRow('kctv_notitle', { telegramDelivery: { ...completeDelivery(), titleSent: false } }),
      buildRow('kctv_partial', { telegramDelivery: { ...completeDelivery(), chunksSent: 1 } }),
      buildRow('kctv_nochunks', { telegramDelivery: { titleSent: true, chunkPathArray: [], chunksSent: 0 } }),
    ]

    const deletedCount = await cleanupOldVidsWatch()

    expect(deletedCount).toBe(0)
    for (const row of incompleteRows) {
      expect(fs.existsSync(row.savePath)).toBe(true)
      expect(row.localDeleted).toBeUndefined()
    }
  })

  it('keeps vids newer than the cutoff', async () => {
    const row = buildRow('kctv_new', { date: daysAgo(3) })

    const deletedCount = await cleanupOldVidsWatch()

    expect(deletedCount).toBe(0)
    expect(fs.existsSync(row.savePath)).toBe(true)
    expect(row.localDeleted).toBeUndefined()
  })

  it('skips records already marked localDeleted without error', async () => {
    const markedAt = daysAgo(1)
    const row = buildRow('kctv_marked', { localDeleted: true, localDeletedAt: markedAt })

    await expect(cleanupOldVidsWatch()).resolves.toBe(0)

    expect(row.localDeletedAt).toBe(markedAt)
    expect(mockCollection.updateOne).not.toHaveBeenCalled()
  })

  it('still marks the record when the file is already gone from disk', async () => {
    const row = buildRow('kctv_gone')
    fs.rmSync(row.savePath)

    await expect(cleanupOldVidsWatch()).resolves.toBe(1)

    expect(row.localDeleted).toBe(true)
    expect(row.localDeletedAt).toBeInstanceOf(Date)
  })

  it('skips and logs a savePath outside WATCH_PATH or not ending in .mp4', async () => {
    const outsidePath = path.join(outsideDir, 'kctv_outside.mp4')
    fs.writeFileSync(outsidePath, Buffer.alloc(128, 1))
    const outsideRow = buildRow('kctv_outside', { savePath: outsidePath })
    const traversalRow = buildRow('kctv_traversal', { savePath: path.join(watchDir, '..', path.basename(outsideDir), 'kctv_outside.mp4') })
    const notMp4Row = buildRow('kctv_notmp4', { savePath: path.join(watchDir, 'kctv_notmp4.jpg') })

    const deletedCount = await cleanupOldVidsWatch()

    expect(deletedCount).toBe(0)
    expect(fs.existsSync(outsidePath)).toBe(true)
    expect(fs.existsSync(notMp4Row.savePath)).toBe(true)
    for (const row of [outsideRow, traversalRow, notMp4Row]) {
      expect(row.localDeleted).toBeUndefined()
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`CLEANUP WATCH SKIPPED UNSAFE PATH: ${row.url}`))
    }
  })

  it('skips a savePath in a subfolder of WATCH_PATH', async () => {
    fs.mkdirSync(path.join(watchDir, 'sub'))
    const subPath = path.join(watchDir, 'sub', 'kctv_sub.mp4')
    fs.writeFileSync(subPath, Buffer.alloc(128, 1))
    const row = buildRow('kctv_sub', { savePath: subPath })
    const rmSpy = vi.spyOn(fs, 'rmSync')

    const deletedCount = await cleanupOldVidsWatch()

    expect(deletedCount).toBe(0)
    expect(rmSpy).not.toHaveBeenCalled()
    expect(fs.existsSync(subPath)).toBe(true)
    expect(row.localDeleted).toBeUndefined()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`CLEANUP WATCH SKIPPED UNSAFE PATH: ${row.url}`))
  })

  it('skips a savePath that goes through a symlinked folder inside WATCH_PATH', async () => {
    fs.symlinkSync(outsideDir, path.join(watchDir, 'link'))
    const outsidePath = path.join(outsideDir, 'kctv_link.mp4')
    fs.writeFileSync(outsidePath, Buffer.alloc(128, 1))
    const row = buildRow('kctv_link', { savePath: path.join(watchDir, 'link', 'kctv_link.mp4') })

    const deletedCount = await cleanupOldVidsWatch()

    expect(deletedCount).toBe(0)
    expect(fs.existsSync(outsidePath)).toBe(true)
    expect(row.localDeleted).toBeUndefined()
  })

  it('deletes a direct child when WATCH_PATH has a trailing slash', async () => {
    process.env.WATCH_PATH = watchDir + path.sep
    const row = buildRow('kctv_slash')

    const deletedCount = await cleanupOldVidsWatch()

    expect(deletedCount).toBe(1)
    expect(fs.existsSync(row.savePath)).toBe(false)
    expect(row.localDeleted).toBe(true)
  })

  it.each([undefined, '0', '-5', 'abc', '7.5'])('defaults WATCH_KEEP_DAYS=%s to 14 days', async (keepDays) => {
    if (keepDays !== undefined) process.env.WATCH_KEEP_DAYS = keepDays
    const oldRow = buildRow('kctv_15d', { date: daysAgo(15) })
    const youngRow = buildRow('kctv_13d', { date: daysAgo(13) })

    await cleanupOldVidsWatch()

    expect(oldRow.localDeleted).toBe(true)
    expect(youngRow.localDeleted).toBeUndefined()
    expect(fs.existsSync(youngRow.savePath)).toBe(true)
  })

  it('uses a valid positive integer WATCH_KEEP_DAYS', async () => {
    process.env.WATCH_KEEP_DAYS = '3'
    const row = buildRow('kctv_5d', { date: daysAgo(5) })

    await cleanupOldVidsWatch()

    expect(row.localDeleted).toBe(true)
  })

  it('leaves the cleaned record out of the download selection (keyExists url / keyEmpty vidSize)', async () => {
    const row = buildRow('kctv_dl')

    await cleanupOldVidsWatch()
    const downloadArray = await new dbModel({ keyExists: 'url', keyEmpty: 'vidSize' }, 'watch').findEmptyItems()

    expect(row.localDeleted).toBe(true)
    expect(downloadArray).toEqual([])
  })

  it('leaves the cleaned record out of the Telegram upload selection (keyExists vidSize / keyEmpty uploaded)', async () => {
    const row = buildRow('kctv_tg')

    await cleanupOldVidsWatch()
    const uploadArray = await new dbModel({ keyExists: 'vidSize', keyEmpty: 'uploaded' }, 'watch').findEmptyItems()

    expect(row.localDeleted).toBe(true)
    expect(uploadArray).toEqual([])
  })
})
