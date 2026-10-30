import { describe, expect, it } from 'vitest'
import { deadlockHeroLabel } from './deadlock'

describe('deadlockHeroLabel', () => {
  const known = [{ hero_id: 13, hero_name: 'Haze' }, { hero_id: 6, hero_name: 'Unknown' }]
  it('maps the watcher key to a real hero name', () => {
    expect(deadlockHeroLabel('hero_13', known)).toBe('Haze')
  })
  it('never shows the raw key', () => {
    expect(deadlockHeroLabel('hero_6', known)).toBe('Unknown hero')
    expect(deadlockHeroLabel('hero_99', null)).toBe('Unknown hero')
    expect(deadlockHeroLabel(null, known)).toBe('Unknown hero')
  })
  it('passes real names through', () => {
    expect(deadlockHeroLabel('Haze', known)).toBe('Haze')
  })
})
