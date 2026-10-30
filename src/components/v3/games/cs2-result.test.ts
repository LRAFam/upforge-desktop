import { describe, expect, it } from 'vitest'
import { shapeCs2Result } from './cs2-result'

describe('shapeCs2Result', () => {
  it('keeps coaching text and measured stats, drops the AI rating and rank ceiling', () => {
    const r = shapeCs2Result({
      status: 'completed', map: 'de_mirage', score: '13-9',
      coaching: { overall_rating: 7, estimated_rank_ceiling: 'FACEIT 10', priority_focus: 'Pre-aim common angles on B.', overall_summary: 'Solid CT half.', strengths: ['Opening duels on A'], key_issues: [{ category: 'Utility', issue: 'Flashes blind teammates', evidence: '2 teammates flashed', fix: 'Pop-flash from cover.' }, { issue: '' }], drills: [{ title: 'Prefire map', description: '10 min', frequency: 'daily' }], economy_notes: 'Forced twice after a loss.' },
      match_stats: { rounds: 22, score: '13-9', player_stats: { kills: 21, deaths: 15, assists: 4 } },
    })!
    expect(r.title).toBe('Mirage · 13–9')
    expect(r.focus).toBe('Pre-aim common angles on B.')
    expect(r.issues).toHaveLength(1)
    expect(r.notes).toEqual([{ label: 'Economy', text: 'Forced twice after a loss.' }])
    expect(r.stats?.headline[0].value).toBe('21 / 15 / 4')
    expect(JSON.stringify(r)).not.toContain('FACEIT 10')
  })
  it('handles a processing analysis without coaching', () => {
    const r = shapeCs2Result({ status: 'processing', map: null })!
    expect(r.status).toBe('processing')
    expect(r.title).toBe('CS2 match')
    expect(r.stats).toBeNull()
  })
  it('rejects junk', () => { expect(shapeCs2Result(null)).toBeNull() })
})
