import { describe, it, expect, beforeEach } from 'vitest'
import kcnaState, { resetStateKCNA } from '../src/util/state.js'

describe('kcnaState', () => {
  beforeEach(() => {
    // reset to clean slate before each test
    resetStateKCNA()
    kcnaState.scrapeActive = false
    kcnaState.schedulerActive = false
  })

  it('has correct initial shape', () => {
    expect(kcnaState).toHaveProperty('scrapeActive')
    expect(kcnaState).toHaveProperty('schedulerActive')
    expect(kcnaState).toHaveProperty('scrapeId')
    expect(kcnaState).toHaveProperty('scrapeStartTime')
    expect(kcnaState).toHaveProperty('scrapeEndTime')
    expect(kcnaState).toHaveProperty('scrapeLengthSeconds')
    expect(kcnaState).toHaveProperty('scrapeLengthMinutes')
    expect(kcnaState).toHaveProperty('scrapeError')
    expect(kcnaState).toHaveProperty('scrapeMessage')
    expect(kcnaState).toHaveProperty('scrapeStep')
  })

  it('starts with scrapeActive false', () => {
    expect(kcnaState.scrapeActive).toBe(false)
  })

  it('starts with schedulerActive false', () => {
    expect(kcnaState.schedulerActive).toBe(false)
  })

  it('is mutable — setting scrapeActive works', () => {
    kcnaState.scrapeActive = true
    expect(kcnaState.scrapeActive).toBe(true)
  })

  it('is a singleton — same object across imports', async () => {
    const { default: kcnaState2 } = await import('../src/util/state.js')
    kcnaState.scrapeActive = true
    expect(kcnaState2.scrapeActive).toBe(true)
  })
})

describe('resetStateKCNA', () => {
  it('resets all RESET_STATE fields to null', () => {
    kcnaState.scrapeId = 'abc'
    kcnaState.scrapeStartTime = new Date()
    kcnaState.scrapeEndTime = new Date()
    kcnaState.scrapeLengthSeconds = 99
    kcnaState.scrapeLengthMinutes = 1
    kcnaState.scrapeError = 'oops'
    kcnaState.scrapeMessage = 'msg'
    kcnaState.scrapeStep = 'step'

    resetStateKCNA()

    expect(kcnaState.scrapeId).toBeNull()
    expect(kcnaState.scrapeStartTime).toBeNull()
    expect(kcnaState.scrapeEndTime).toBeNull()
    expect(kcnaState.scrapeLengthSeconds).toBeNull()
    expect(kcnaState.scrapeLengthMinutes).toBeNull()
    expect(kcnaState.scrapeError).toBeNull()
    expect(kcnaState.scrapeMessage).toBeNull()
    expect(kcnaState.scrapeStep).toBeNull()
  })

  it('does not reset scrapeActive or schedulerActive', () => {
    kcnaState.scrapeActive = true
    kcnaState.schedulerActive = true
    resetStateKCNA()
    // these are NOT in RESET_STATE so they stay unchanged
    expect(kcnaState.scrapeActive).toBe(true)
    expect(kcnaState.schedulerActive).toBe(true)
  })
})
