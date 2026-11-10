import { describe, expect, it } from 'vitest'
import { submissionFocusAreas } from './submission-focus'

describe('per-submission focus', () => {
  it('preserves absence and bounds explicit player instructions', () => {
    expect(submissionFocusAreas(undefined)).toBeUndefined()
    expect(submissionFocusAreas([])).toBeUndefined()
    expect(submissionFocusAreas(['  trading decisions  '])).toEqual(['trading decisions'])
    for (const value of [null, 'aim', [''], [1], ['x'.repeat(201)], ['a', 'b', 'c', 'd']]) {
      expect(() => submissionFocusAreas(value)).toThrow()
    }
  })
})
