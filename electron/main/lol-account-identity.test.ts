import { describe, expect, it } from 'vitest'
import { applyLolCaptureContext, captureLolAccount, normalizeLolPlatform } from './lol-account-identity'
import type { MatchData } from './riot-types'

describe('recorded League identity', () => {
  it('requires the observed Riot ID and a known platform, without guessing from a display name', () => {
    expect(captureLolAccount({ gameName: 'Alt', tagLine: 'EUW' }, 'EUW')).toEqual({ gameName: 'Alt', tagLine: 'EUW', platform: 'EUW1' })
    expect(captureLolAccount({ gameName: 'Alt' }, 'EUW')).toBeNull()
    expect(captureLolAccount({ gameName: 'Alt', tagLine: 'EUW' }, 'unknown')).toBeNull()
    expect(normalizeLolPlatform('PBE')).toBeNull()
  })

  it('keeps separate identities and queues for consecutive games on different alts', () => {
    const first = applyLolCaptureContext({ playerName: 'Alt', playerTag: 'EUW' } as MatchData, {
      account: { gameName: 'Alt', tagLine: 'EUW', platform: 'EUW1' }, matchId: 'EUW1_123', queueId: 420,
    })
    const second = applyLolCaptureContext({ playerName: 'Other', playerTag: 'NA' } as MatchData, {
      account: { gameName: 'Other', tagLine: 'NA', platform: 'NA1' }, matchId: 'NA1_456', queueId: 440,
    })
    expect(JSON.parse(JSON.stringify(first))).toMatchObject({ lolAccount: { gameName: 'Alt' }, matchId: 'EUW1_123', queueId: '420', region: 'europe' })
    expect(second).toMatchObject({ lolAccount: { gameName: 'Other' }, matchId: 'NA1_456', queueId: '440', region: 'americas' })
  })

  it('rejects stale LCU identity when the live player belongs to another account', () => {
    const timeline = { playerName: 'LiveAlt', playerTag: 'EUW', matchId: null } as MatchData
    applyLolCaptureContext(timeline, {
      account: { gameName: 'PreviousAlt', tagLine: 'EUW', platform: 'EUW1' }, matchId: 'EUW1_123', queueId: 420,
    })
    expect(timeline.lolAccount).toBeUndefined()
    expect(timeline.matchId).toBeNull()
  })
})
