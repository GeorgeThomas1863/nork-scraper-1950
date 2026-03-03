import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock db-config before importing dbModel
vi.mock('../middleware/db-config.js', () => {
  const mockCollection = {
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    findOne: vi.fn(),
    find: vi.fn(),
    deleteOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  }

  const mockDb = {
    collection: vi.fn(() => mockCollection),
  }

  return {
    dbGet: vi.fn(() => mockDb),
    dbConnect: vi.fn(),
  }
})

import dbModel from '../models/db-model.js'
import { dbGet } from '../middleware/db-config.js'

// Helper to get the mock collection
const getMockCollection = () => dbGet().collection()

beforeEach(() => {
  vi.clearAllMocks()

  // Re-wire find() to return a chainable object by default
  getMockCollection().find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue([]),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  })
})

// ---- storeAny ----

describe('dbModel.storeAny', () => {
  it('calls insertOne with the dataObject', async () => {
    const col = getMockCollection()
    col.insertOne.mockResolvedValue({ insertedId: 'id1' })

    const model = new dbModel({ url: 'http://example.com' }, 'articles')
    const result = await model.storeAny()

    expect(col.insertOne).toHaveBeenCalledWith({ url: 'http://example.com' })
    expect(result.insertedId).toBe('id1')
  })
})

// ---- storeUniqueURL ----

describe('dbModel.storeUniqueURL', () => {
  it('returns null when URL already exists', async () => {
    const col = getMockCollection()
    col.findOne.mockResolvedValue({ url: 'http://example.com', _id: '123' })

    const model = new dbModel({ url: 'http://example.com' }, 'articles')
    const result = await model.storeUniqueURL()

    expect(result).toBeNull()
    expect(col.insertOne).not.toHaveBeenCalled()
  })

  it('calls insertOne when URL does not exist', async () => {
    const col = getMockCollection()
    col.findOne.mockResolvedValue(null)
    col.insertOne.mockResolvedValue({ insertedId: 'newId' })

    const model = new dbModel({ url: 'http://example.com' }, 'articles')
    const result = await model.storeUniqueURL()

    expect(col.insertOne).toHaveBeenCalled()
    expect(result.insertedId).toBe('newId')
  })
})

// ---- updateObjItem ----

describe('dbModel.updateObjItem', () => {
  it('calls updateOne with correct filter and $set', async () => {
    const col = getMockCollection()
    col.updateOne.mockResolvedValue({ modifiedCount: 1 })

    const model = new dbModel(
      { keyToLookup: 'url', itemValue: 'http://example.com', updateObj: { text: 'hello' } },
      'articles'
    )
    const result = await model.updateObjItem()

    expect(col.updateOne).toHaveBeenCalledWith(
      { url: 'http://example.com' },
      { $set: { text: 'hello' } }
    )
    expect(result.modifiedCount).toBe(1)
  })
})

// ---- updateArrayNested ----

describe('dbModel.updateArrayNested', () => {
  it('calls updateOne with correct nested array update', async () => {
    const col = getMockCollection()
    col.updateOne.mockResolvedValue({ modifiedCount: 1 })

    const model = new dbModel(
      { docKey: 'url', docValue: 'http://x.com', updateKey: 'picArray', updateArray: ['pic1', 'pic2'] },
      'articles'
    )
    await model.updateArrayNested()

    expect(col.updateOne).toHaveBeenCalledWith(
      { url: 'http://x.com' },
      { $set: { picArray: ['pic1', 'pic2'] } }
    )
  })
})

// ---- getAll ----

describe('dbModel.getAll', () => {
  it('returns array from find().toArray()', async () => {
    const col = getMockCollection()
    col.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ _id: '1' }]) })

    const model = new dbModel({}, 'articles')
    const result = await model.getAll()

    expect(result).toEqual([{ _id: '1' }])
  })
})

// ---- getUniqueItem ----

describe('dbModel.getUniqueItem', () => {
  it('returns single doc matching keyToLookup/itemValue', async () => {
    const col = getMockCollection()
    col.findOne.mockResolvedValue({ _id: '1', url: 'http://example.com' })

    const model = new dbModel({ keyToLookup: 'url', itemValue: 'http://example.com' }, 'articles')
    const result = await model.getUniqueItem()

    expect(col.findOne).toHaveBeenCalledWith({ url: 'http://example.com' })
    expect(result.url).toBe('http://example.com')
  })
})

// ---- getUniqueArray ----

describe('dbModel.getUniqueArray', () => {
  it('returns array of docs matching keyToLookup/itemValue', async () => {
    const col = getMockCollection()
    col.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ scrapeId: 'abc' }]) })

    const model = new dbModel({ keyToLookup: 'scrapeId', itemValue: 'abc' }, 'scrapeLog')
    const result = await model.getUniqueArray()

    expect(col.find).toHaveBeenCalledWith({ scrapeId: 'abc' })
    expect(result).toEqual([{ scrapeId: 'abc' }])
  })
})

// ---- getLastItemsArray ----

describe('dbModel.getLastItemsArray', () => {
  it('calls find with sort and limit', async () => {
    const toArrayMock = vi.fn().mockResolvedValue([{ articleId: 5 }])
    const limitMock = vi.fn().mockReturnValue({ toArray: toArrayMock })
    const sortMock = vi.fn().mockReturnValue({ limit: limitMock })
    const col = getMockCollection()
    col.find.mockReturnValue({ sort: sortMock })

    const model = new dbModel({ keyToLookup: 'articleId', howMany: '1' }, 'articles')
    const result = await model.getLastItemsArray()

    expect(col.find).toHaveBeenCalled()
    expect(sortMock).toHaveBeenCalledWith({ articleId: -1 })
    expect(limitMock).toHaveBeenCalledWith(1)
    expect(result).toEqual([{ articleId: 5 }])
  })
})

// ---- urlExists ----

describe('dbModel.urlExists', () => {
  it('returns the found doc when url exists', async () => {
    const col = getMockCollection()
    col.findOne.mockResolvedValue({ url: 'http://example.com' })

    const model = new dbModel({ url: 'http://example.com' }, 'articles')
    const result = await model.urlExists()

    expect(col.findOne).toHaveBeenCalledWith({ url: 'http://example.com' })
    expect(result).toBeTruthy()
  })

  it('returns null when url does not exist', async () => {
    const col = getMockCollection()
    col.findOne.mockResolvedValue(null)

    const model = new dbModel({ url: 'http://new.com' }, 'articles')
    const result = await model.urlExists()

    expect(result).toBeNull()
  })
})

// ---- itemExistsCheckBoolean ----

describe('dbModel.itemExistsCheckBoolean', () => {
  it('returns false when item not found', async () => {
    const col = getMockCollection()
    col.findOne.mockResolvedValue(null)

    const model = new dbModel({ keyToLookup: 'articleId', itemValue: 99 }, 'articles')
    expect(await model.itemExistsCheckBoolean()).toBe(false)
  })

  it('returns true when item found', async () => {
    const col = getMockCollection()
    col.findOne.mockResolvedValue({ articleId: 1 })

    const model = new dbModel({ keyToLookup: 'articleId', itemValue: 1 }, 'articles')
    expect(await model.itemExistsCheckBoolean()).toBe(true)
  })
})

// ---- findEmptyItems ----

describe('dbModel.findEmptyItems', () => {
  it('queries with $or for missing/null/empty/false keyEmpty and keyExists present', async () => {
    const col = getMockCollection()
    col.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([{ url: 'x' }]) })

    const model = new dbModel({ keyExists: 'url', keyEmpty: 'text' }, 'articles')
    const result = await model.findEmptyItems()

    const callArg = col.find.mock.calls[0][0]
    expect(callArg).toHaveProperty('$or')
    expect(callArg).toHaveProperty('url')
    expect(result).toEqual([{ url: 'x' }])
  })
})

// ---- findEmptyItemsNested ----

describe('dbModel.findEmptyItemsNested', () => {
  it('queries with nested path for empty items', async () => {
    const col = getMockCollection()
    col.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })

    const model = new dbModel({ keyExists: 'url', keyEmpty: 'picSize', arrayKey: 'picArray' }, 'articles')
    await model.findEmptyItemsNested()

    const callArg = col.find.mock.calls[0][0]
    // nestedPath should be 'picArray.picSize'
    expect(JSON.stringify(callArg)).toContain('picArray.picSize')
  })
})

// ---- deleteItem ----

describe('dbModel.deleteItem', () => {
  it('calls deleteOne with correct filter', async () => {
    const col = getMockCollection()
    col.deleteOne.mockResolvedValue({ deletedCount: 1 })

    const model = new dbModel({ keyToLookup: 'articleId', itemValue: 5 }, 'articles')
    const result = await model.deleteItem()

    expect(col.deleteOne).toHaveBeenCalledWith({ articleId: 5 })
    expect(result.deletedCount).toBe(1)
  })
})

// ---- nextId ----

describe('dbModel.nextId', () => {
  it('upserts counter and returns incremented seq', async () => {
    const col = getMockCollection()
    // existing counter found
    col.findOne.mockResolvedValue({ _id: 'articles', seq: 10 })
    col.findOneAndUpdate.mockResolvedValue({ seq: 11 })

    const model = new dbModel({ idKey: 'articleId' }, 'articles')
    const id = await model.nextId()

    expect(col.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'articles' },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' }
    )
    expect(id).toBe(11)
  })

  it('seeds counter from collection max when no counter exists', async () => {
    const col = getMockCollection()
    // First findOne (counters check) returns null => no counter
    col.findOne.mockResolvedValueOnce(null)
    // Second findOne would come from find().sort().limit() — handled via find mock
    const toArrayMock = vi.fn().mockResolvedValue([{ articleId: 5 }])
    col.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({ toArray: toArrayMock }),
    })
    col.updateOne.mockResolvedValue({})
    col.findOneAndUpdate.mockResolvedValue({ seq: 6 })

    const model = new dbModel({ idKey: 'articleId' }, 'articles')
    const id = await model.nextId()

    // updateOne should have been called to seed the counter
    expect(col.updateOne).toHaveBeenCalledWith(
      { _id: 'articles' },
      { $setOnInsert: { seq: 5 } },
      { upsert: true }
    )
    expect(id).toBe(6)
  })
})
