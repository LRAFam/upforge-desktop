import { describe, expect, it } from 'vitest'
import {
  formatDemoSection,
  formatLastMatchSection,
  formatLeagueSection,
  type SupportDemoSnapshot,
  type SupportLastMatchSnapshot,
  type SupportLolProbeSnapshot,
} from './support-diagnostics'

describe('formatLastMatchSection', () => {
  it('reports empty session', () => {
    const lines = formatLastMatchSection(null)
    expect(lines[0]).toBe('=== LAST MATCH ===')
    expect(lines.join('\n')).toContain('No match finalized this session.')
  })

  it('dumps key fields without em dashes', () => {
    const snap: SupportLastMatchSnapshot = {
      game: 'lol',
      timestamp: 1_700_000_000_000,
      matchId: null,
      map: "Summoner's Rift",
      agent: 'Caitlyn',
      gameMode: 'CLASSIC',
      endReason: 'process',
      matchDetailsStatus: 'no_match_id',
      lolEnrichStatus: 'no_match_id',
      queueId: null,
      killsInTimeline: 4,
      clipsExtracted: 0,
      recordingDuration: 1800,
      fileSizeMb: 930,
    }
    const text = formatLastMatchSection(snap).join('\n')
    expect(text).toContain('Game: lol')
    expect(text).toContain('Match ID: null')
    expect(text).toContain('End reason: process')
    expect(text).toContain('lolEnrichStatus: no_match_id')
    expect(text).not.toContain('—')
  })
})

describe('formatLeagueSection', () => {
  it('includes LCU and Live Client fields without password', () => {
    const probe: SupportLolProbeSnapshot = {
      lockfileFound: true,
      phase: 'None',
      queueId: null,
      queueLabel: null,
      gameMode: null,
      error: null,
      liveClientReachable: false,
      liveClientInMatch: false,
      liveClientGameMode: null,
      lolPlatform: 'NA1',
      hasLolPuuid: true,
      dedicatedLolAccount: false,
    }
    const text = formatLeagueSection(probe).join('\n')
    expect(text).toContain('=== LEAGUE ===')
    expect(text).toContain('LCU lockfile: true')
    expect(text).toContain('Live Client reachable: false')
    expect(text).toContain('hasLolPuuid: true')
    expect(text).not.toContain('password')
  })
})

describe('formatDemoSection', () => {
  it('returns empty when null', () => {
    expect(formatDemoSection(null)).toEqual([])
  })

  it('includes basename only', () => {
    const snap: SupportDemoSnapshot = {
      game: 'cs2',
      demoPresent: true,
      demoBasename: 'match.dem',
      syncStatus: 'synced',
    }
    const text = formatDemoSection(snap).join('\n')
    expect(text).toContain('=== CS2 / DEADLOCK ===')
    expect(text).toContain('match.dem')
    expect(text).not.toContain('/Users/')
  })
})
