import { describe, expect, it } from 'vitest'
import {
  DeadlockQueueLookups,
  deadlockAllowsAutoAnalyse,
  deadlockApiQueue,
  deadlockAutoAnalyseDecision,
  deadlockManualOnlyActivity,
} from './deadlock-auto-analyse'

describe('Deadlock auto-analyse gate (owner decision 16 Nov)', () => {
  it('analyses Ranked automatically and keeps Standard / Street Brawl manual', () => {
    expect(deadlockAutoAnalyseDecision('RANKED')).toBe('auto')
    expect(deadlockAutoAnalyseDecision('UNRANKED')).toBe('manual_only')
    expect(deadlockAutoAnalyseDecision('STANDARD')).toBe('manual_only')
    expect(deadlockAutoAnalyseDecision('STREET_BRAWL')).toBe('manual_only')
    expect(deadlockAutoAnalyseDecision('COOP_BOT')).toBe('manual_only')
    expect(deadlockAutoAnalyseDecision('PRIVATE_LOBBY')).toBe('manual_only')
  })

  it('treats the placeholder and missing queues as unknown (still automatic)', () => {
    for (const mode of ['COMPETITIVE', 'DEADLOCK', null, undefined, '']) {
      expect(deadlockAutoAnalyseDecision(mode)).toBe('unknown')
      expect(deadlockAllowsAutoAnalyse(mode)).toBe(true)
    }
  })

  it('maps recording modes to the API queue names', () => {
    expect(deadlockApiQueue('RANKED')).toBe('ranked')
    expect(deadlockApiQueue('UNRANKED')).toBe('standard')
    expect(deadlockApiQueue('STREET_BRAWL')).toBe('street_brawl')
    expect(deadlockApiQueue('HERO_LABS')).toBe('other')
    expect(deadlockApiQueue('COMPETITIVE')).toBeNull()
  })

  it('says why a match was not analysed', () => {
    expect(deadlockManualOnlyActivity('STREET_BRAWL')).toContain('Street Brawl')
    expect(deadlockManualOnlyActivity('UNRANKED')).toContain('Standard')
    expect(deadlockManualOnlyActivity('UNRANKED')).toContain('Tap Analyse')
  })
})

describe('DeadlockQueueLookups', () => {
  it('shares one lookup per match and reports it pending until it settles', async () => {
    const lookups = new DeadlockQueueLookups()
    let resolve!: (mode: string | null) => void
    const first = lookups.remember(42, new Promise<string | null>((r) => { resolve = r }))
    let started = 0
    const second = lookups.queueFor(42, async () => { started++; return 'RANKED' })
    expect(lookups.isPending(42)).toBe(true)
    expect(lookups.isPending('42')).toBe(true)
    resolve('UNRANKED')
    expect(await first).toBe('UNRANKED')
    expect(await second).toBe('UNRANKED')
    expect(started).toBe(0)
    expect(lookups.isPending(42)).toBe(false)
  })

  it('starts a lookup when none is running and turns failures into unknown', async () => {
    const lookups = new DeadlockQueueLookups()
    expect(await lookups.queueFor(7, async () => { throw new Error('offline') })).toBeNull()
    expect(lookups.isPending(7)).toBe(false)
    expect(lookups.isPending(null)).toBe(false)
  })
})
