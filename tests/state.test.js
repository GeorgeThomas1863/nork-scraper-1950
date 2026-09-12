import { describe, it, expect, beforeEach } from 'vitest'

import kcnaState, { resetStateKCNA } from '../src/util/state.js'

beforeEach(() => {
  resetStateKCNA()
})

describe('resetStateKCNA', () => {
  it('does not touch scrapeActive or schedulerActive', () => {
    kcnaState.scrapeActive = true
    kcnaState.schedulerActive = true

    resetStateKCNA()

    expect(kcnaState.scrapeActive).toBe(true)
    expect(kcnaState.schedulerActive).toBe(true)
  })
})
