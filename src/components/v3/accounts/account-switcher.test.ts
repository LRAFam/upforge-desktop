import { describe, expect, it } from 'vitest'
import { switcherView } from './account-switcher'

describe('switcherView', () => {
  it('lists Valorant accounts main first and lets alts become main', () => {
    const v = switcherView('valorant', { valorant: [
      { id: 2, riot_name: 'Smurf', riot_tag: '0420', riot_region: 'eu', is_active: false },
      { id: 1, riot_name: 'LRAFam', riot_tag: '1337', riot_region: 'eu', is_active: true },
    ] })
    expect(v.multi).toBe(true)
    expect(v.rows.map(r => [r.label, r.isMain, r.canMakeMain])).toEqual([['LRAFam#1337', true, false], ['Smurf#0420', false, true]])
    expect(v.rows[0].sub).toBe('Region EU')
  })

  it('lists League accounts with their server', () => {
    const v = switcherView('lol', { lol: [{ id: 5, riot_name: 'Mid', riot_tag: 'EUW', platform: 'EUW1', is_main: true }] })
    expect(v.rows).toEqual([{ id: 5, label: 'Mid#EUW', sub: 'Server EUW1', isMain: true, canMakeMain: false }])
  })

  it('shows CS2 and Deadlock identities without switching', () => {
    const cs2 = switcherView('cs2', { cs2: { steamName: 'flick', faceitNickname: 'flickfc' } })
    expect(cs2.multi).toBe(false)
    expect(cs2.rows.every(r => !r.canMakeMain)).toBe(true)
    expect(cs2.rows.map(r => r.sub)).toEqual(['Steam name', 'FACEIT'])
    expect(switcherView('deadlock', { deadlock: { linked: true, name: null } }).rows[0].label).toBe('Steam account')
  })

  it('gives an honest empty state per game', () => {
    expect(switcherView('valorant', {}).rows).toEqual([])
    expect(switcherView('deadlock', { deadlock: { linked: false } }).empty).toBe('No Deadlock account linked yet.')
  })
})
