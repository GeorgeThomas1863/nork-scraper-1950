import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'

// Mock axios and form-data before importing tg-api
vi.mock('axios', () => {
  return { default: vi.fn() }
})

vi.mock('form-data', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      this.append = vi.fn()
      this.getHeaders = vi.fn().mockReturnValue({ 'content-type': 'multipart/form-data' })
    }),
  }
})

import axios from 'axios'
import {
  tgGetReq,
  tgPostReq,
  tgPostPicReq,
  buildPicForm,
  checkToken,
  tgSendMessage,
} from '../src/tg-api.js'

beforeEach(() => {
  vi.clearAllMocks()
})

// ---- tgGetReq ----

describe('tgGetReq', () => {
  it('returns null for falsy url', async () => {
    expect(await tgGetReq(null)).toBeNull()
    expect(await tgGetReq('')).toBeNull()
  })

  it('returns response data on success', async () => {
    axios.get = vi.fn().mockResolvedValue({ data: { ok: true, result: [] } })
    const result = await tgGetReq('https://api.telegram.org/botTOKEN/getUpdates')
    expect(result).toEqual({ ok: true, result: [] })
  })

  it('returns error response data on 429 (axios throws)', async () => {
    const errResponse = { ok: false, error_code: 429 }
    axios.get = vi.fn().mockRejectedValue({ response: { data: errResponse } })
    const result = await tgGetReq('https://api.telegram.org/botTOKEN/getUpdates')
    expect(result).toEqual(errResponse)
  })
})

// ---- tgPostReq ----

describe('tgPostReq', () => {
  it('returns null when url or params missing', async () => {
    expect(await tgPostReq(null, {})).toBeNull()
    expect(await tgPostReq('https://url', null)).toBeNull()
  })

  it('returns response data on success', async () => {
    axios.post = vi.fn().mockResolvedValue({ data: { ok: true, result: { message_id: 1 } } })
    const result = await tgPostReq('https://api.telegram.org/botTOKEN/sendMessage', { chat_id: '-1234', text: 'hi' })
    expect(result.ok).toBe(true)
  })

  it('returns error data when axios throws', async () => {
    const errData = { ok: false, description: 'Bad Request' }
    axios.post = vi.fn().mockRejectedValue({ response: { data: errData } })
    const result = await tgPostReq('https://url', { chat_id: '1' })
    expect(result).toEqual(errData)
  })
})

// ---- tgPostPicReq ----

describe('tgPostPicReq', () => {
  it('returns null when url or form missing', async () => {
    expect(await tgPostPicReq(null, {})).toBeNull()
    expect(await tgPostPicReq('https://url', null)).toBeNull()
  })

  it('posts with form headers and returns response data', async () => {
    const mockForm = {
      getHeaders: vi.fn().mockReturnValue({ 'content-type': 'multipart/form-data' }),
    }
    axios.post = vi.fn().mockResolvedValue({ data: { ok: true } })
    const result = await tgPostPicReq('https://api.telegram.org/botTOKEN/sendPhoto', mockForm)
    expect(axios.post).toHaveBeenCalledWith('https://api.telegram.org/botTOKEN/sendPhoto', mockForm, {
      headers: { 'content-type': 'multipart/form-data' },
    })
    expect(result.ok).toBe(true)
  })
})

// ---- buildPicForm ----

describe('buildPicForm', () => {
  it('returns null for falsy input', async () => {
    expect(await buildPicForm(null)).toBeNull()
    expect(await buildPicForm(undefined)).toBeNull()
  })

  it('returns null when savePath does not exist on filesystem', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await buildPicForm({
      chatId: '-1234',
      savePath: '/nonexistent/path/pic.jpg',
      caption: 'test',
      mode: 'HTML',
    })
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })

  it('builds a FormData object when savePath exists', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'createReadStream').mockReturnValue('STREAM')

    const result = await buildPicForm({
      chatId: '-1001234567890',
      savePath: '/tmp/pics/kcna_pic_1.jpg',
      caption: 'Test caption',
      mode: 'HTML',
    })

    expect(result).not.toBeNull()
    expect(result.append).toHaveBeenCalledWith('chat_id', '-1001234567890')
    expect(result.append).toHaveBeenCalledWith('photo', 'STREAM')
    expect(result.append).toHaveBeenCalledWith('caption', 'Test caption')
    expect(result.append).toHaveBeenCalledWith('parse_mode', 'HTML')

    vi.restoreAllMocks()
  })
})

// ---- checkToken ----

describe('checkToken', () => {
  it('returns true when data.ok is truthy', async () => {
    const result = await checkToken({ ok: true })
    expect(result).toBe(true)
  })

  it('returns null and rotates token index when data.ok is falsy', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await checkToken({ ok: false })
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })

  it('returns null when data is null', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await checkToken(null)
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })
})

// ---- tgSendMessage (integration-level with mocked axios.post) ----

describe('tgSendMessage', () => {
  it('returns data when token succeeds', async () => {
    axios.post = vi.fn().mockResolvedValue({ data: { ok: true, result: { message_id: 42 } } })

    const result = await tgSendMessage({ chat_id: '-1234', text: 'hello', parse_mode: 'HTML' })
    expect(result).toEqual({ ok: true, result: { message_id: 42 } })
  })

  it('returns null when all tokens exhausted', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    // All post calls return ok: false
    axios.post = vi.fn().mockResolvedValue({ data: { ok: false } })

    const result = await tgSendMessage({ chat_id: '-1234', text: 'fail' }, 999)
    expect(result).toBeNull()
    consoleSpy.mockRestore()
  })
})
