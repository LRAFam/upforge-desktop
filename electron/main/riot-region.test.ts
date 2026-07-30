import { describe, expect, it } from 'vitest'
import { normalizeValorantRegion, resolveValorantGameRegion } from './riot-region'

describe('normalizeValorantRegion', () => {
  it('normalizes EU chat affinities', () => {
    expect(normalizeValorantRegion('eu')).toBe('eu')
    expect(normalizeValorantRegion('eu2')).toBe('eu')
    expect(normalizeValorantRegion('euw1')).toBe('eu')
  })

  it('maps explicit LAN/LAS chat codes to latam', () => {
    expect(normalizeValorantRegion('la1')).toBe('latam')
    expect(normalizeValorantRegion('la2')).toBe('latam')
  })

  it('rejects bare la as ambiguous', () => {
    expect(normalizeValorantRegion('la')).toBeNull()
  })

  it('keeps standard Valorant regions', () => {
    expect(normalizeValorantRegion('br')).toBe('br')
    expect(normalizeValorantRegion('latam')).toBe('latam')
    expect(normalizeValorantRegion('ap')).toBe('ap')
  })
})

describe('resolveValorantGameRegion', () => {
  it('prefers deployment over account and chat', () => {
    expect(resolveValorantGameRegion({
      deploymentRegion: 'eu',
      accountRegion: 'na',
      chatRegion: 'la1',
    })).toEqual({ region: 'eu', source: 'deployment' })
  })

  it('uses linked account region before chat la1', () => {
    expect(resolveValorantGameRegion({
      deploymentRegion: null,
      accountRegion: 'eu',
      chatRegion: 'la1',
    })).toEqual({ region: 'eu', source: 'account' })
  })

  it('falls back to chat only when deployment and account are missing', () => {
    expect(resolveValorantGameRegion({
      deploymentRegion: null,
      accountRegion: null,
      chatRegion: 'la1',
    })).toEqual({ region: 'latam', source: 'chat' })
  })

  it('ignores bare chat la when account is eu', () => {
    expect(resolveValorantGameRegion({
      deploymentRegion: null,
      accountRegion: 'eu',
      chatRegion: 'la',
    })).toEqual({ region: 'eu', source: 'account' })
  })
})
