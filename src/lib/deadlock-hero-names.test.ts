import { beforeEach, describe, expect, it } from 'vitest'
import { deadlockHeroes, deadlockRecordingHero, heroesFromStats } from './deadlock-hero-names'

beforeEach(() => { deadlockHeroes.value = [] })

describe('Deadlock recording hero names', () => {
  it('maps the watcher key to a name from stats the app already has', () => {
    deadlockHeroes.value = heroesFromStats({ hero_stats: [{ hero_id: 13, hero_name: 'Haze' }], recent_matches: [{ hero_id: 6, hero_name: 'Abrams' }] })
    expect(deadlockRecordingHero('hero_13')).toBe('Haze')
    expect(deadlockRecordingHero('hero_6')).toBe('Abrams')
  })
  it('never shows the raw key', () => {
    expect(deadlockRecordingHero('hero_99')).toBe('Unknown hero')
    expect(deadlockRecordingHero(null)).toBe('Unknown hero')
  })
  it('passes real names through', () => {
    expect(deadlockRecordingHero('Lady Geist')).toBe('Lady Geist')
  })
  it('ignores malformed stats', () => {
    expect(heroesFromStats(null)).toEqual([])
    expect(heroesFromStats({ hero_stats: [{ hero_id: '1', hero_name: 'x' }] })).toEqual([])
  })
})
