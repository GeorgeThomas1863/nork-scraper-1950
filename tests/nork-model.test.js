import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock axios before importing NORK
vi.mock('axios', () => {
  return {
    default: vi.fn(),
  }
})

import axios from 'axios'
import NORK from '../models/nork-model.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('NORK.getHTML', () => {
  it('returns html string on success', async () => {
    axios.mockResolvedValue({ data: '<html><body>Hello</body></html>' })

    const nork = new NORK({ url: 'http://www.kcna.kp/en/article/test.kcmsf' })
    const result = await nork.getHTML()

    expect(result).toBe('<html><body>Hello</body></html>')
    expect(axios).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'get',
        url: 'http://www.kcna.kp/en/article/test.kcmsf',
        responseType: 'text',
        timeout: 60000,
      })
    )
  })

  it('returns null and logs when axios throws', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    axios.mockRejectedValue(new Error('Network error'))

    const nork = new NORK({ url: 'http://bad-url.kp' })
    const result = await nork.getHTML()

    expect(result).toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('ERROR, for ' + 'http://bad-url.kp')
    consoleSpy.mockRestore()
  })

  it('passes the url from dataObject to axios', async () => {
    axios.mockResolvedValue({ data: '<p>content</p>' })

    const url = 'http://www.kcna.kp/en/category/articles/q/abc.kcmsf'
    const nork = new NORK({ url })
    await nork.getHTML()

    expect(axios).toHaveBeenCalledWith(expect.objectContaining({ url }))
  })
})
