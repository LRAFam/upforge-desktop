import { describe, expect, it } from 'vitest'
import { analysisForMatch, lolCoachingView } from './lol-coaching'

const detail = {
  status: 'completed',
  match_data: {
    rank_at_match: 'Gold II · 30 LP',
    lane_metrics: { opponent_champion: 'Graves', at: { 10: { cs: 72, opponent_cs: 81, gold_diff: -450, xp_diff: -120 }, 15: { cs: 122 } }, first_death_sec: 512 },
  },
  analysis_result: { coaching: {
    summary: 'Defeat on Ahri.', priority_focus: 'Ward river before 3:00.',
    strengths: ['Good roams', ''],
    priority_improvements: [{ theme: 'CS', issue: '72 CS at 10', fix: 'Last-hit under tower' }, { theme: '' }],
    moments: [{ timestamp: '08:32', title: 'Died mid', coaching_note: 'No ward' }],
    drills: [{ title: 'Last-hit drill', description: 'Practice Tool, 10 min', frequency: 'daily' }, { description: 'no title' }],
  } },
}

describe('lolCoachingView', () => {
  it('shapes a completed analysis without inventing fields', () => {
    const v = lolCoachingView(detail)!
    expect(v.status).toBe('ready')
    expect(v.focus).toBe('Ward river before 3:00.')
    expect(v.rankLabel).toBe('Gold II · 30 LP')
    expect(v.strengths).toEqual(['Good roams'])
    expect(v.improvements).toEqual([{ theme: 'CS', issue: '72 CS at 10', fix: 'Last-hit under tower' }])
    expect(v.drills).toEqual([{ title: 'Last-hit drill', description: 'Practice Tool, 10 min', frequency: 'daily' }])
    expect(v.lane).toEqual([
      { minute: '10:00', text: 'CS 72 vs 81 (Graves) · gold -450 · XP -120' },
      { minute: '15:00', text: 'CS 122' },
    ])
  })

  it('reports failures and work in progress honestly', () => {
    expect(lolCoachingView({ status: 'failed', error: 'Refunded' })).toMatchObject({ status: 'failed', error: 'Refunded', summary: null })
    expect(lolCoachingView({ status: 'processing' })!.status).toBe('working')
    expect(lolCoachingView(null)).toBeNull()
  })
})

describe('analysisForMatch', () => {
  it('matches Riot ids case-insensitively and prefers the newest row', () => {
    const rows = [{ id: 9, match_id: 'EUW1_1' }, { id: 3, match_id: 'EUW1_1' }]
    expect(analysisForMatch(rows, 'euw1_1')!.id).toBe(9)
    expect(analysisForMatch(rows, null)).toBeNull()
  })

  it('links a recording that only captured the numeric game id, but never across regions', () => {
    const rows = [{ id: 4, match_id: 'EUW1_7001' }, { id: 5, match_id: 'NA1_7002' }]
    expect(analysisForMatch(rows, '7001')!.id).toBe(4)
    expect(analysisForMatch(rows, 'NA1_7001')).toBeNull()
    expect(analysisForMatch(rows, '70')).toBeNull()
  })
})
