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

  it('returns the safe API message when runScraper throws', async () => {
    const scrapeError = new Error('DB exploded')
    scrapeError.apiMessage = 'Scrape failed during ARTICLE URLS KCNA'
    runScraper.mockRejectedValue(scrapeError)

    const req = makeReq({ password: 'test-password', command: 'admin-start-scrape' })
    const res = makeRes()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await apiEndpointController(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Scrape failed during ARTICLE URLS KCNA' })
    consoleSpy.mockRestore()
  })

  it('logs authenticated command context without the password', async () => {
    runScraper.mockResolvedValue({ scrapeActive: false })
    const req = makeReq({ password: 'test-password', command: 'admin-start-scrape', howMuch: 'admin-scrape-new' })
    const res = makeRes()
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await apiEndpointController(req, res)

    const loggedValues = []
    for (const call of consoleSpy.mock.calls) loggedValues.push(...call)
    expect(loggedValues).toContainEqual({ command: 'admin-start-scrape', howMuch: 'admin-scrape-new' })
    expect(JSON.stringify(loggedValues)).not.toContain('test-password')
    consoleSpy.mockRestore()
  })
})
