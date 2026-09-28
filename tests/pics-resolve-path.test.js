import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

// BUG 3: pics stored before the Docker move (2026-09-11) have a stale absolute savePath
// ("/home/user/media/pics/<picName>") that no longer exists in the container. postPicTG must
// rebuild the file path from the CURRENT PIC_PATH + file name instead of trusting the stored savePath.

vi.mock('../src/tg-api.js', () => ({
  tgPostPicFS: vi.fn(),
}))

import { tgPostPicFS } from '../src/tg-api.js'
import { postPicTG } from '../src/kcna/pics.js'

describe('postPicTG - resolvePicFilePath (BUG 3)', () => {
  let tempDir
  let originalPicPath

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})

    originalPicPath = process.env.PIC_PATH
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nork-pics-'))
    fs.writeFileSync(path.join(tempDir, 'x.jpg'), 'fake-jpeg-bytes')
    process.env.PIC_PATH = tempDir

    tgPostPicFS.mockResolvedValue({ ok: true, result: { message_id: 42 } })
  })

  afterEach(() => {
    process.env.PIC_PATH = originalPicPath
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('posts using the current PIC_PATH + picName, ignoring a stale stored savePath directory', async () => {
    await postPicTG({
      savePath: '/home/user/media/pics/x.jpg',
      picName: 'x.jpg',
      caption: 'cap',
      tgChannelId: '-1234',
    })

    expect(tgPostPicFS).toHaveBeenCalledWith(
      expect.objectContaining({ savePath: path.join(tempDir, 'x.jpg') })
    )
  })

  it('falls back to the basename of savePath when picName is missing', async () => {
    await postPicTG({
      savePath: '/home/user/media/pics/x.jpg',
      caption: 'cap',
      tgChannelId: '-1234',
    })

    expect(tgPostPicFS).toHaveBeenCalledWith(
      expect.objectContaining({ savePath: path.join(tempDir, 'x.jpg') })
    )
  })
})
