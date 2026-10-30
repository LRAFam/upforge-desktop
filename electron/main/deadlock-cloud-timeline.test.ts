import { describe, expect, it } from 'vitest'
import { deadlockTimelineFromCloud } from './deadlock-cloud-timeline'
import { hasRichMatchData } from './match-data-quality'

const base = { jobId: 'job-1', recordingStartTime: 1_000_000, matchStartTime: 990_000, hero: 'Haze' }

describe('deadlockTimelineFromCloud', () => {
  it('builds kills, deaths and assists with video offsets from the match clock', () => {
    const t = deadlockTimelineFromCloud({ ...base, events: [
      { type: 'death', time_seconds: 640, attacker_hero: 'Abrams', victim_hero: 'Haze' },
      { type: 'kill', time_seconds: 300, attacker_hero: 'Haze', victim_hero: 'Abrams' },
      { type: 'assist', time_seconds: 700, attacker_hero: 'Seven', victim_hero: 'Vindicta' },
    ] })!
    expect(t.playerKills).toHaveLength(1)
    expect(t.playerDeaths[0].killerName).toBe('Abrams')
    expect(t.killEvents.map(e => e.EventTime)).toEqual([300, 640, 700])
    // Recording started 10 s after the match, so the video is 10 s behind the match clock.
    expect(t.playerKills[0].videoOffsetMs).toBe(290_000)
    expect(t.finalStats).toMatchObject({ kills: 1, deaths: 1, assists: 1 })
    expect(t.matchDetails).toMatchObject({ source: 'deadlock_cloud_replay', jobId: 'job-1' })
    expect(hasRichMatchData(t)).toBe(true)
  })

  it('returns null without usable events so the Analyse lock stays on', () => {
    expect(deadlockTimelineFromCloud({ ...base, events: [] })).toBeNull()
    expect(deadlockTimelineFromCloud({ ...base, events: [{ type: 'kill', time_seconds: -1 }, { type: 'nope' as 'kill', time_seconds: 3 }] })).toBeNull()
    expect(deadlockTimelineFromCloud({ ...base, events: null })).toBeNull()
  })

  it('caps the number of events', () => {
    const events = Array.from({ length: 500 }, (_, i) => ({ type: 'kill' as const, time_seconds: i }))
    expect(deadlockTimelineFromCloud({ ...base, events })!.killEvents).toHaveLength(200)
  })
})
