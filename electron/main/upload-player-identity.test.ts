import { describe, expect, it } from 'vitest'
import { resolveUploadPlayerIdentity } from './upload-player-identity'

describe('resolveUploadPlayerIdentity', () => {
  it('keeps the complete recorded League identity when another account is linked', () => {
    expect(resolveUploadPlayerIdentity('lol', {
      playerName: 'PlayedAlt', playerTag: 'EUW',
    } as never, { riot_name: 'ValorantSmurf', riot_tag: 'NA1' })).toEqual({
      riotName: 'PlayedAlt', riotTag: 'EUW',
    })
    expect(resolveUploadPlayerIdentity('lol', null, {
      riot_name: 'ValorantSmurf', riot_tag: 'NA1', name: 'UpForgeUser',
    })).toEqual({ riotName: '', riotTag: '' })
  })
  it('uses riot id for valorant', () => {
    const identity = resolveUploadPlayerIdentity(
      'valorant',
      { playerName: 'Timeline', playerTag: 'TL' } as never,
      { riot_name: 'Account', riot_tag: 'NA1', name: 'User' },
    )
    expect(identity).toEqual({ riotName: 'Timeline', riotTag: 'TL' })
  })

  it('uses steam/demo name for cs2 without riot account', () => {
    const identity = resolveUploadPlayerIdentity(
      'cs2',
      { playerName: 'csgo_ninja' } as never,
      { riot_name: '', riot_tag: '', name: 'Dizer' },
    )
    expect(identity).toEqual({ riotName: 'csgo_ninja', riotTag: 'NA' })
  })

  it('prefers cs2 steam name from settings when timeline missing', () => {
    const identity = resolveUploadPlayerIdentity('cs2', null, { name: 'Dizer' }, undefined, 'csgo_ninja')
    expect(identity).toEqual({ riotName: 'csgo_ninja', riotTag: 'NA' })
  })

  it('falls back to account name for cs2 when timeline name missing', () => {
    const identity = resolveUploadPlayerIdentity('cs2', null, { name: 'Dizer' })
    expect(identity).toEqual({ riotName: 'Dizer', riotTag: 'NA' })
  })
})
