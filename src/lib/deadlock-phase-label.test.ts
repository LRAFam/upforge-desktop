import { describe, expect, it } from 'vitest'
import { deadlockPhaseLabel } from './deadlock'

describe('deadlockPhaseLabel', () => {
  it('turns watcher phases into plain words', () => {
    expect(deadlockPhaseLabel('idle')).toBe('Waiting for Deadlock')
    expect(deadlockPhaseLabel('in_match')).toBe('In a match')
    expect(deadlockPhaseLabel('post_match')).toBe('Match ended')
  })
  it('never shows a raw key', () => {
    expect(deadlockPhaseLabel('something_new')).toBe('Unknown')
    expect(deadlockPhaseLabel(null)).toBe('Unknown')
  })
})
