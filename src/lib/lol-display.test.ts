import { describe, expect, it } from 'vitest'
import { lolAnalysisStatus, lolIdentity, lolIdentityNote, lolMatchMeta, lolNoMatchesText, lolRoleLabel } from './lol-display'
import { lolQueueLabel } from './lol'
import type { LolMatchSummary } from '../env.d.ts'

const match: LolMatchSummary = {
  match_id: 'EUW1_1', queue_id: 440, champion: 'Ahri', role: 'MIDDLE', lane: 'MIDDLE', win: true,
  kills: 8, deaths: 2, assists: 5, game_duration_seconds: 1880, game_creation: 0,
}

describe('lol-display', () => {
  it('prefers the League Riot ID and says when the Valorant one stands in', () => {
    expect(lolIdentity({ lol_riot_name: 'Mid', lol_riot_tag: '#EUW', riot_name: 'Val', riot_tag: '1' })).toEqual({ label: 'Mid#EUW', source: 'league' })
    const val = lolIdentity({ riot_name: 'LRAFam', riot_tag: '1337', lol_riot_name: null })
    expect(val).toEqual({ label: 'LRAFam#1337', source: 'valorant' })
    expect(lolIdentityNote(val)).toBe('LRAFam#1337 · your Valorant Riot ID')
    expect(lolIdentity({ lol_riot_name: 'Half', riot_name: null })).toEqual({ label: '', source: null })
  })

  it('empty state names the Riot ID and the next step', () => {
    expect(lolNoMatchesText({ label: 'LRAFam#1337', source: 'valorant' })).toContain('link it in Settings')
    expect(lolNoMatchesText({ label: 'Mid#EUW', source: 'league' })).toContain('ARAM and other modes')
  })

  it('never shows a raw status or queue id', () => {
    expect(lolAnalysisStatus({ status: 'completed', readiness_state: null })).toBe('Ready')
    expect(lolAnalysisStatus({ status: 'processing', readiness_state: 'waiting_match_data' })).toBe('Waiting for Riot match data')
    expect(lolAnalysisStatus({ status: 'pending', readiness_state: null })).toBe('Being written')
    expect(lolQueueLabel(440)).toBe('Ranked Flex')
    expect(lolQueueLabel(400)).toBe('Normal Draft')
    expect(lolQueueLabel(9999)).toBe('Other mode')
  })

  it('match meta leaves out what Riot did not send', () => {
    expect(lolRoleLabel('UTILITY')).toBe('Support')
    expect(lolRoleLabel('')).toBeNull()
    expect(lolMatchMeta(match)).toBe('Mid · 31:20 · Ranked Flex')
    expect(lolMatchMeta({ ...match, cs_per_min: 7.06, vision_score: 21.4 } as LolMatchSummary)).toBe('Mid · 31:20 · 7.1 CS/min · 21 vision · Ranked Flex')
    expect(lolMatchMeta({ ...match, role: 'NONE', game_duration_seconds: 0 })).toBe('Ranked Flex')
  })
})
