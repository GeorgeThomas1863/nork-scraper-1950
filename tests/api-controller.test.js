import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock runScraper before importing the controller
vi.mock('../src/src.js', () => ({
  runScraper: vi.fn(),
}))

import { apiEndpointController } from '../controllers/api-controller.js'
import { runScraper } from '../src/src.js'

const makeReq = (body) => ({ body })
const makeRes = () => {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('apiEndpointController', () => {
  it('returns 401 when password is wrong', async () => {
    const req = makeReq({ password: 'wrong', command: 'admin-scrape-status' })
    const res = makeRes()

    await apiEndpointController(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' })
    expect(runScraper).not.toHaveBeenCalled()
  })

  it('returns 401 when password is missing', async () => {
    const req = makeReq({ command: 'admin-scrape-status' })
    const res = makeRes()

    await apiEndpointController(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('calls runScraper and returns data on success', async () => {
    const fakeState = { scrapeActive: false, scrapeMessage: 'ok' }
    runScraper.mockResolvedValue(fakeState)

    const req = makeReq({ password: 'test-password', command: 'admin-scrape-status' })
    const res = makeRes()

    await apiEndpointController(req, res)

    expect(runScraper).toHaveBeenCalledWith({ password: 'test-password', command: 'admin-scrape-status' })
    expect(res.json).toHaveBeenCalledWith(fakeState)
  })

  it('returns 500 when runScraper throws', async () => {
    runScraper.mockRejectedValue(new Error('DB exploded'))

    const req = makeReq({ password: 'test-password', command: 'admin-start-scrape' })
    const res = makeRes()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await apiEndpointController(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'DB exploded' })
    consoleSpy.mockRestore()
  })
})
