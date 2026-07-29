import { describe, expect, it } from 'vitest'
import { riotPdHostname, riotPdShard } from './riot-pd-shard'

describe('riotPdShard', () => {
  it('maps Brazil and LATAM onto the na PD shard', () => {
    expect(riotPdShard('br')).toBe('na')
    expect(riotPdShard('BR')).toBe('na')
    expect(riotPdShard('latam')).toBe('na')
    expect(riotPdShard('la')).toBe('na')
  })

  it('keeps eu/ap/kr/na on their own shards', () => {
    expect(riotPdShard('na')).toBe('na')
    expect(riotPdShard('eu')).toBe('eu')
    expect(riotPdShard('euw1')).toBe('eu')
    expect(riotPdShard('ap')).toBe('ap')
    expect(riotPdShard('kr')).toBe('kr')
  })

  it('maps legacy ko region ids back to kr for PD', () => {
    expect(riotPdShard('ko')).toBe('kr')
  })

  it('rejects empty or unsafe values', () => {
    expect(riotPdShard(null)).toBeNull()
    expect(riotPdShard('na.evil')).toBeNull()
  })
})

describe('riotPdHostname', () => {
  it('builds the PD host from the shard, not raw br/latam/la', () => {
    expect(riotPdHostname('br')).toBe('pd.na.a.pvp.net')
    expect(riotPdHostname('latam')).toBe('pd.na.a.pvp.net')
    expect(riotPdHostname('la')).toBe('pd.na.a.pvp.net')
    expect(riotPdHostname('eu')).toBe('pd.eu.a.pvp.net')
  })
})
