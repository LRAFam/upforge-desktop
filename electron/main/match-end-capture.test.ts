import { describe, expect, it, vi } from 'vitest'
import { resolveMatchEndCapture, shouldFinalizeMatchMedia } from './match-end-capture'

describe('match ended before capture', () => {
  it('never resolves a stale previous-match file or scans for an onboarding file', () => {
    const resolvePreviousFile = vi.fn(() => ({ path: 'previous-match.mp4', sizeBytes: 5000 }))
    expect(resolveMatchEndCapture(true, resolvePreviousFile)).toBeNull()
    expect(resolvePreviousFile).not.toHaveBeenCalled()
    expect(shouldFinalizeMatchMedia(true, false)).toBe(false)
  })

  it('preserves source-replay processing without granting access to old video', () => {
    const resolvePreviousFile = vi.fn(() => ({ path: 'previous-match.mp4' }))
    expect(shouldFinalizeMatchMedia(true, true)).toBe(true)
    expect(resolveMatchEndCapture(true, resolvePreviousFile)).toBeNull()
    expect(resolvePreviousFile).not.toHaveBeenCalled()
  })

  it('resolves the captured match normally', () => {
    const file = { path: 'current-match.mp4', sizeBytes: 5000 }
    expect(resolveMatchEndCapture(false, () => file)).toBe(file)
    expect(shouldFinalizeMatchMedia(false, false)).toBe(true)
  })
})
