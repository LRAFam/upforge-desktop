import { describe, expect, it } from 'vitest'
import { shouldSyncPrimaryGame } from './primary-game-sync'

describe('shouldSyncPrimaryGame', () => {
  it('always syncs in packaged builds', () => {
    expect(shouldSyncPrimaryGame(false, undefined)).toBe(true)
  })
  it('keeps dev switches local unless explicitly asked', () => {
    expect(shouldSyncPrimaryGame(true, undefined)).toBe(false)
    expect(shouldSyncPrimaryGame(true, '1')).toBe(true)
  })
})
