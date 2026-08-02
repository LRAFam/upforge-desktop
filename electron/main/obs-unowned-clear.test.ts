import { describe, expect, it } from 'vitest'
import { nextUnownedClearAction } from './obs-unowned-clear'

describe('nextUnownedClearAction', () => {
  it('clears when idle', () => {
    expect(nextUnownedClearAction({ attempt: 0, maxStopAttempts: 2, outputActive: false })).toBe('cleared')
  })

  it('stops while attempts remain', () => {
    expect(nextUnownedClearAction({ attempt: 0, maxStopAttempts: 2, outputActive: true })).toBe('stop')
    expect(nextUnownedClearAction({ attempt: 1, maxStopAttempts: 2, outputActive: true })).toBe('stop')
  })

  it('blocks after max attempts', () => {
    expect(nextUnownedClearAction({ attempt: 2, maxStopAttempts: 2, outputActive: true })).toBe('blocked')
  })
})
