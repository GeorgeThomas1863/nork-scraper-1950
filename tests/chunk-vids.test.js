import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'

const { mockExecFile } = vi.hoisted(() => ({ mockExecFile: vi.fn() }))

vi.mock('node:child_process', () => ({ execFile: mockExecFile }))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: {
      ...actual.default,
      existsSync: vi.fn(),
      statSync: vi.fn(),
      mkdirSync: vi.fn(),
      readdirSync: vi.fn(),
      rmSync: vi.fn(),
    },
  }
})

import fs from 'fs'
import { buildVidChunks, removeVidChunks, TG_VID_MAX_BYTES } from '../src/watch/chunk-vids.js'

const savePath = '/tmp/watch/test-vid.mp4'
const chunkDir = '/tmp/watch/chunks'
const baseName = 'test-vid'

// ffprobe resolves { stdout, stderr }; ffmpeg resolves the same shape with empty output.
// Real execFile carries a util.promisify.custom symbol that makes promisify(execFile)
// resolve this way; the mock here reproduces that shape directly via its callback.
const mockFfprobeDuration = (durationSeconds, execError = null) => {
  mockExecFile.mockImplementation((file, args, callback) => {
    if (file === 'ffprobe') {
      if (execError) return callback(execError)
      return callback(null, { stdout: `${durationSeconds}\n`, stderr: '' })
    }
    return callback(null, { stdout: '', stderr: '' })
  })
}

const chunkPath = (name) => path.join(chunkDir, name)

const mb = (n) => n * 1024 * 1024

beforeEach(() => {
  vi.clearAllMocks()
  fs.existsSync.mockReturnValue(true)
  fs.mkdirSync.mockImplementation(() => {})
  fs.rmSync.mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('buildVidChunks', () => {
  it('returns null for missing args', async () => {
    expect(await buildVidChunks(null, chunkDir, baseName)).toBeNull()
    expect(await buildVidChunks(savePath, null, baseName)).toBeNull()
    expect(await buildVidChunks(savePath, chunkDir, null)).toBeNull()
    expect(fs.existsSync).not.toHaveBeenCalled()
  })

  it('returns null when the source file is missing', async () => {
    fs.existsSync.mockReturnValue(false)

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toBeNull()
    expect(fs.mkdirSync).not.toHaveBeenCalled()
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  it('returns [savePath] without running ffmpeg or ffprobe when the file is already under the limit', async () => {
    fs.statSync.mockReturnValue({ size: mb(10) })

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toEqual([savePath])
    expect(fs.mkdirSync).toHaveBeenCalledWith(chunkDir, { recursive: true })
    expect(mockExecFile).not.toHaveBeenCalled()
  })

  it('computes segment_time from duration/size/target and passes it to ffmpeg', async () => {
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      return { size: mb(10) } // produced chunk: comfortably under the limit
    })
    fs.readdirSync
      .mockReturnValueOnce([]) // stale-chunk sweep before ffmpeg runs
      .mockReturnValueOnce([`${baseName}_p00.mp4`]) // chunks produced by ffmpeg

    mockFfprobeDuration(1800)

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toEqual([chunkPath(`${baseName}_p00.mp4`)])

    const ffmpegCall = mockExecFile.mock.calls.find((call) => call[0] === 'ffmpeg')
    expect(ffmpegCall).toBeTruthy()
    const ffmpegArgs = ffmpegCall[1]
    const segmentTimeIndex = ffmpegArgs.indexOf('-segment_time')
    expect(segmentTimeIndex).toBeGreaterThan(-1)
    expect(ffmpegArgs[segmentTimeIndex + 1]).toBe('501')
    expect(mockExecFile).toHaveBeenCalledTimes(2) // one ffprobe call, one ffmpeg call
  })

  it('verifies segment_format_options carries movflags=+faststart to the segment muxer', async () => {
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      return { size: mb(10) }
    })
    fs.readdirSync.mockReturnValueOnce([]).mockReturnValueOnce([`${baseName}_p00.mp4`])
    mockFfprobeDuration(1800)

    await buildVidChunks(savePath, chunkDir, baseName)

    const ffmpegCall = mockExecFile.mock.calls.find((call) => call[0] === 'ffmpeg')
    const ffmpegArgs = ffmpegCall[1]
    const optionsIndex = ffmpegArgs.indexOf('-segment_format_options')
    expect(optionsIndex).toBeGreaterThan(-1)
    expect(ffmpegArgs[optionsIndex + 1]).toBe('movflags=+faststart')
    expect(ffmpegArgs).toEqual(
      expect.arrayContaining(['-f', 'segment', '-c', 'copy', '-map', '0', '-reset_timestamps', '1'])
    )
  })

  it('retries once with a halved segment time when a produced chunk is oversized', async () => {
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      if (filePath === chunkPath(`${baseName}_p00.mp4`)) return { size: mb(60) } // first attempt: too big
      return { size: mb(10) } // retry attempt: fits
    })
    fs.readdirSync
      .mockReturnValueOnce([]) // stale sweep, first attempt
      .mockReturnValueOnce([`${baseName}_p00.mp4`]) // first attempt: too big
      .mockReturnValueOnce([]) // stale sweep, retry attempt
      .mockReturnValueOnce([`${baseName}_p01.mp4`]) // retry attempt: fits

    mockFfprobeDuration(1800)

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toEqual([chunkPath(`${baseName}_p01.mp4`)])

    const ffmpegCalls = mockExecFile.mock.calls.filter((call) => call[0] === 'ffmpeg')
    expect(ffmpegCalls).toHaveLength(2)

    // 1800s / 137 MiB file against the 40,000,000-byte default target:
    // floor(1800 * 40_000_000 / 143_654_912) = 501; halved retry = floor(501 / 2) = 250
    const firstSegmentTime = Number(ffmpegCalls[0][1][ffmpegCalls[0][1].indexOf('-segment_time') + 1])
    const retrySegmentTime = Number(ffmpegCalls[1][1][ffmpegCalls[1][1].indexOf('-segment_time') + 1])
    expect(firstSegmentTime).toBe(501)
    expect(retrySegmentTime).toBe(250)

    // the oversized first-attempt chunk got removed before the retry
    expect(fs.rmSync).toHaveBeenCalledWith(chunkPath(`${baseName}_p00.mp4`), { force: true })
  })

  it('rejects a produced chunk at exactly the 50,000,000-byte limit and retries', async () => {
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      if (filePath === chunkPath(`${baseName}_p00.mp4`)) return { size: 50_000_000 } // at the limit: rejected
      return { size: 49_999_999 } // retry attempt: just under the limit
    })
    fs.readdirSync
      .mockReturnValueOnce([])
      .mockReturnValueOnce([`${baseName}_p00.mp4`])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([`${baseName}_p01.mp4`])

    mockFfprobeDuration(1800)

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toEqual([chunkPath(`${baseName}_p01.mp4`)])
    const ffmpegCalls = mockExecFile.mock.calls.filter((call) => call[0] === 'ffmpeg')
    expect(ffmpegCalls).toHaveLength(2)
  })

  it('accepts a produced chunk at 49,999,999 bytes without retrying', async () => {
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      return { size: 49_999_999 }
    })
    fs.readdirSync.mockReturnValueOnce([]).mockReturnValueOnce([`${baseName}_p00.mp4`])

    mockFfprobeDuration(1800)

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toEqual([chunkPath(`${baseName}_p00.mp4`)])
    const ffmpegCalls = mockExecFile.mock.calls.filter((call) => call[0] === 'ffmpeg')
    expect(ffmpegCalls).toHaveLength(1)
  })

  it('sorts produced chunk files by numeric index, not lexicographically', async () => {
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      return { size: mb(1) }
    })

    // p10/p11/p100 is the case that breaks default string sort: "_p100" < "_p11"
    // lexicographically (comparing the 3rd char, '0' < '1') even though 100 > 11.
    // Confirmed with node -e: default .sort() on this set yields
    // ...p10, p100, p11 while numeric order is ...p10, p11, p100.
    const numericNameArray = [
      `${baseName}_p00.mp4`,
      `${baseName}_p01.mp4`,
      `${baseName}_p09.mp4`,
      `${baseName}_p10.mp4`,
      `${baseName}_p11.mp4`,
      `${baseName}_p100.mp4`,
    ]

    // fed out of order: a correct implementation must sort by the parsed numeric
    // index, not by default lexicographic string order
    const shuffledNameArray = [
      numericNameArray[3],
      numericNameArray[5],
      numericNameArray[0],
      numericNameArray[4],
      numericNameArray[2],
      numericNameArray[1],
    ]

    fs.readdirSync.mockReturnValueOnce([]).mockReturnValueOnce(shuffledNameArray)

    mockFfprobeDuration(1800)

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toEqual(numericNameArray.map((name) => chunkPath(name)))
  })

  it('does not match a filename that merely resembles baseName_p<digits> when baseName itself ends with "_p"', async () => {
    const edgeBaseName = 'foo_p'
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      return { size: mb(1) }
    })
    fs.readdirSync
      .mockReturnValueOnce([])
      .mockReturnValueOnce(['foo_p2.mp4', `${edgeBaseName}_p00.mp4`])

    mockFfprobeDuration(1800)

    const result = await buildVidChunks(savePath, chunkDir, edgeBaseName)

    expect(result).toEqual([chunkPath(`${edgeBaseName}_p00.mp4`)])
  })

  it('rejects a filename with extra text inserted before the _p<digits> suffix', async () => {
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      return { size: mb(1) }
    })
    fs.readdirSync
      .mockReturnValueOnce([])
      .mockReturnValueOnce([`${baseName}_extra_p00.mp4`, `${baseName}_p00.mp4`])

    mockFfprobeDuration(1800)

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toEqual([chunkPath(`${baseName}_p00.mp4`)])
  })

  it('removes chunks and returns null when still oversized after the retry', async () => {
    fs.statSync.mockImplementation((filePath) => {
      if (filePath === savePath) return { size: mb(137) }
      return { size: mb(60) } // every produced chunk is oversized, both attempts
    })
    fs.readdirSync
      .mockReturnValueOnce([])
      .mockReturnValueOnce([`${baseName}_p00.mp4`])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([`${baseName}_p00.mp4`])

    mockFfprobeDuration(1800)

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toBeNull()
    const ffmpegCalls = mockExecFile.mock.calls.filter((call) => call[0] === 'ffmpeg')
    expect(ffmpegCalls).toHaveLength(2)
    expect(fs.rmSync).toHaveBeenCalledWith(chunkPath(`${baseName}_p00.mp4`), { force: true })
  })

  it('returns null when ffprobe fails', async () => {
    fs.statSync.mockReturnValue({ size: mb(137) })
    mockFfprobeDuration(1800, new Error('ffprobe: no such file'))

    const result = await buildVidChunks(savePath, chunkDir, baseName)

    expect(result).toBeNull()
    expect(mockExecFile).toHaveBeenCalledTimes(1) // ffprobe only, never reaches ffmpeg
  })
})

describe('removeVidChunks', () => {
  it('removes every path except keepPath', () => {
    removeVidChunks(['/a.mp4', '/b.mp4', '/keep.mp4'], '/keep.mp4')

    expect(fs.rmSync).toHaveBeenCalledWith('/a.mp4', { force: true })
    expect(fs.rmSync).toHaveBeenCalledWith('/b.mp4', { force: true })
    expect(fs.rmSync).not.toHaveBeenCalledWith('/keep.mp4', { force: true })
  })

  it('swallows rmSync errors and keeps going', () => {
    fs.rmSync.mockImplementation((p) => {
      if (p === '/a.mp4') throw new Error('EPERM')
    })

    expect(() => removeVidChunks(['/a.mp4', '/b.mp4'], null)).not.toThrow()
    expect(fs.rmSync).toHaveBeenCalledWith('/a.mp4', { force: true })
    expect(fs.rmSync).toHaveBeenCalledWith('/b.mp4', { force: true })
  })

  it('does nothing for an empty or missing array', () => {
    removeVidChunks([], '/keep.mp4')
    removeVidChunks(null, '/keep.mp4')

    expect(fs.rmSync).not.toHaveBeenCalled()
  })
})

// sanity check that the constant matches Telegram's bot upload limit
describe('TG_VID_MAX_BYTES', () => {
  it('is 50,000,000 bytes (the decimal MB figure, not MiB)', () => {
    expect(TG_VID_MAX_BYTES).toBe(50_000_000)
  })
})
