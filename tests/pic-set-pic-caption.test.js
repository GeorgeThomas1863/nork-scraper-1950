import { describe, it, expect } from 'vitest'

// Dedicated file for the BUG 2 fix to buildPicSetPicCaption (src/kcna/picSets.js), kept
// separate from tests/picSets.test.js so it doesn't collide with other in-progress work
// on that file/test suite (bugs 4 and 5 touch other picSets.js functions).
import { buildPicSetPicCaption } from '../src/kcna/picSets.js'

describe('BUG 2 - buildPicSetPicCaption caption length', () => {
  it('does not put a data: URL in the caption', () => {
    const dataURL = 'data:;base64,' + 'A'.repeat(500000)
    const result = buildPicSetPicCaption({
      picIndex: 1,
      picCount: 1,
      date: new Date(2024, 5, 15),
      url: dataURL,
    })

    expect(result).not.toBeNull()
    expect(result).not.toContain('data:')
    expect(result).toContain('embedded image')
  })

  it('keeps the visible caption text within 1024 chars for a 5,000-char normal URL', () => {
    const longURL = 'http://www.kcna.kp/' + 'a'.repeat(5000) + '.jpg'
    const result = buildPicSetPicCaption({
      picIndex: 3,
      picCount: 9,
      date: new Date(2024, 5, 15),
      url: longURL,
    })

    expect(result).not.toBeNull()
    const visibleLength = result.replace(/<[^>]+>/g, '')
      .replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').length
    expect(visibleLength).toBeLessThanOrEqual(1024)
  })
})
