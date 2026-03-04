import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dbModel at class level — intercept every `new dbModel(...)` call
const mockGetUniqueItem = vi.fn()
const mockUpdateArrayNested = vi.fn()
const mockFindEmptyItemsNested = vi.fn()

vi.mock('../models/db-model.js', () => ({
  default: vi.fn().mockImplementation(function (params) {
    this._params = params
    this.getUniqueItem = mockGetUniqueItem
    this.updateArrayNested = mockUpdateArrayNested
    this.findEmptyItemsNested = mockFindEmptyItemsNested
  }),
}))

import kcnaState, { resetStateKCNA } from '../src/util/state.js'
import {
  getPicData,
  rebuildPicArray,
  updateArticleItem,
  updatePicSetItem,
} from '../src/util/update-db.js'

beforeEach(() => {
  resetStateKCNA()
  kcnaState.scrapeActive = true
  vi.clearAllMocks()
})

// ---- getPicData ----

describe('getPicData', () => {
  it('returns null for null url', async () => {
    expect(await getPicData(null)).toBeNull()
  })

  it('returns null for empty string url', async () => {
    expect(await getPicData('')).toBeNull()
  })

  it('returns pic document from DB when found', async () => {
    const picDoc = { url: 'http://kcna.kp/pic.jpg', picSize: 12345, savePath: '/tmp/pic.jpg' }
    mockGetUniqueItem.mockResolvedValue(picDoc)
    const result = await getPicData('http://kcna.kp/pic.jpg')
    expect(result).toEqual(picDoc)
  })

  it('returns null when DB returns null', async () => {
    mockGetUniqueItem.mockResolvedValue(null)
    const result = await getPicData('http://missing.com/pic.jpg')
    expect(result).toBeNull()
  })
})

// ---- rebuildPicArray ----

describe('rebuildPicArray', () => {
  it('returns null for null input', async () => {
    expect(await rebuildPicArray(null)).toBeNull()
  })

  it('returns null for empty array', async () => {
    expect(await rebuildPicArray([])).toBeNull()
  })

  it('returns array of pic docs for found URLs', async () => {
    const picDoc = { url: 'http://kcna.kp/pic.jpg', picSize: 100 }
    mockGetUniqueItem.mockResolvedValue(picDoc)
    const result = await rebuildPicArray(['http://kcna.kp/pic.jpg'])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(picDoc)
  })

  it('skips URLs where no pic doc is found', async () => {
    mockGetUniqueItem.mockResolvedValue(null)
    const result = await rebuildPicArray(['http://missing.com/pic.jpg'])
    expect(result).toHaveLength(0)
  })

  it('returns empty array immediately when scrapeActive is false', async () => {
    kcnaState.scrapeActive = false
    const picDoc = { url: 'http://a.com/pic.jpg', picSize: 50 }
    mockGetUniqueItem.mockResolvedValue(picDoc)
    const result = await rebuildPicArray(['http://a.com/pic.jpg', 'http://b.com/pic.jpg'])
    expect(result).toEqual([])
    expect(mockGetUniqueItem).not.toHaveBeenCalled()
  })

  it('handles multiple URLs, returning docs for each found', async () => {
    const doc1 = { url: 'http://a.com/1.jpg', picSize: 100 }
    const doc2 = { url: 'http://a.com/2.jpg', picSize: 200 }
    mockGetUniqueItem
      .mockResolvedValueOnce(doc1)
      .mockResolvedValueOnce(doc2)
    const result = await rebuildPicArray(['http://a.com/1.jpg', 'http://a.com/2.jpg'])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(doc1)
    expect(result[1]).toEqual(doc2)
  })
})

// ---- updateArticleItem ----

describe('updateArticleItem', () => {
  it('returns null for null input', async () => {
    expect(await updateArticleItem(null)).toBeNull()
  })

  it('returns null when picArray is missing', async () => {
    expect(await updateArticleItem({ url: 'http://test.com' })).toBeNull()
  })

  it('returns null when picArray is empty', async () => {
    expect(await updateArticleItem({ url: 'http://test.com', picArray: [] })).toBeNull()
  })

  it('returns null when rebuildPicArray produces no results', async () => {
    mockGetUniqueItem.mockResolvedValue(null)
    const result = await updateArticleItem({
      url: 'http://kcna.kp/article.html',
      picArray: ['http://missing.com/pic.jpg'],
    })
    expect(result).toBeNull()
  })

  it('calls updateArrayNested and returns update params on success', async () => {
    const picDoc = { url: 'http://kcna.kp/pic.jpg', picSize: 500, savePath: '/tmp/pic.jpg' }
    mockGetUniqueItem.mockResolvedValue(picDoc)
    mockUpdateArrayNested.mockResolvedValue({ modifiedCount: 1 })

    const result = await updateArticleItem({
      url: 'http://kcna.kp/article.html',
      picArray: ['http://kcna.kp/pic.jpg'],
    })

    expect(mockUpdateArrayNested).toHaveBeenCalled()
    expect(result).toMatchObject({
      docKey: 'url',
      docValue: 'http://kcna.kp/article.html',
      updateKey: 'picArray',
      updateArray: [picDoc],
    })
  })
})

// ---- updatePicSetItem ----

describe('updatePicSetItem', () => {
  it('returns null for null input', async () => {
    expect(await updatePicSetItem(null)).toBeNull()
  })

  it('returns null when picArray is missing', async () => {
    expect(await updatePicSetItem({ url: 'http://test.com' })).toBeNull()
  })

  it('returns null when picArray is empty', async () => {
    expect(await updatePicSetItem({ url: 'http://test.com', picArray: [] })).toBeNull()
  })

  it('calls updateArrayNested and returns update params on success', async () => {
    const picDoc = { url: 'http://kcna.kp/picset-pic.jpg', picSize: 200 }
    mockGetUniqueItem.mockResolvedValue(picDoc)
    mockUpdateArrayNested.mockResolvedValue({ modifiedCount: 1 })

    const result = await updatePicSetItem({
      url: 'http://kcna.kp/picset.html',
      picArray: ['http://kcna.kp/picset-pic.jpg'],
    })

    expect(mockUpdateArrayNested).toHaveBeenCalled()
    expect(result).toMatchObject({
      docKey: 'url',
      docValue: 'http://kcna.kp/picset.html',
      updateKey: 'picArray',
      updateArray: [picDoc],
    })
  })
})
