import { describe, expect, it } from 'vitest'
import type { PendingRecording } from '../env.d.ts'
import { recordingRowStats } from './dashboard-match-row'

function recording(timeline: PendingRecording['timeline']): PendingRecording {
  return {
    id: 'recording-1',
    path: '/tmp/match.mkv',
    game: 'valorant',
    map: 'Ascent',
    agent: 'Omen',
    gameMode: 'competitive',
    recordedAt: 1,
    analysed: false,
    timeline,
  }
}

describe('recordingRowStats', () => {
  it('returns synced match stats before analysis', () => {
    const stats = recordingRowStats(recording({
      finalStats: {
        kills: 21,
        deaths: 14,
        assists: 7,
        score: 4320,
        headshotPct: 31,
        won: true,
      },
      finalScore: { allyScore: 13, enemyScore: 8 },
      roundSummaries: Array.from({ length: 21 }, (_, index) => ({ roundNumber: index + 1 })),
    }))

    expect(stats).toEqual({
      won: true,
      rounds_won: 13,
      rounds_lost: 8,
      kills: 21,
      deaths: 14,
      assists: 7,
      combat_score: 206,
      hs_pct: 31,
    })
  })

  it('keeps unavailable fields explicitly missing', () => {
    expect(recordingRowStats(recording(null))).toEqual({
      won: null,
      rounds_won: null,
      rounds_lost: null,
      kills: null,
      deaths: null,
      assists: null,
      combat_score: null,
      hs_pct: null,
    })
  })
})
