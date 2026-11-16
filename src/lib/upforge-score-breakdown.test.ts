import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { averageLine, baselineLine, breakdownRows, ordinal, sanitizeUpforgeScore, sanitizeUpforgeScoreBreakdown } from './upforge-score-breakdown'

const api = {
  version: 1, score: 612, game: 'valorant', tier: 'platinum',
  baseline: { source: 'tier', tier: 'platinum', samples: 1240 },
  inputs: [
    { key: 'acs', label: 'ACS', value: 241, percentile: 72, weight: 0.3 },
    { key: 'damage_delta', label: 'Damage delta / round', value: 18.4, percentile: 70, weight: 0.3 },
    { key: 'kast', label: 'KAST', value: 0.75, percentile: 61, weight: 0.25 },
    { key: 'outcome', label: 'Result', value: '13-9', percentile: 69, weight: 0.15 },
  ],
}

describe('sanitizeUpforgeScore', () => {
  it('keeps 0–1000 ints, drops junk', () => {
    expect(sanitizeUpforgeScore(612)).toBe(612)
    expect(sanitizeUpforgeScore(1200)).toBe(1000)
    expect(sanitizeUpforgeScore('612')).toBeNull()
    expect(sanitizeUpforgeScore(undefined)).toBeNull()
  })
})

describe('sanitizeUpforgeScoreBreakdown', () => {
  it('keeps the API shape', () => {
    const bd = sanitizeUpforgeScoreBreakdown(api)!
    expect(bd.baseline).toEqual({ source: 'tier', tier: 'platinum', samples: 1240 })
    expect(bd.inputs).toHaveLength(4)
    expect(bd.inputs[3].value).toBe('13-9')
  })
  it('drops malformed inputs and returns null when nothing usable is left', () => {
    expect(sanitizeUpforgeScoreBreakdown(null)).toBeNull()
    expect(sanitizeUpforgeScoreBreakdown({ baseline: { source: 'tier' }, inputs: [{ key: 'acs' }] })).toBeNull()
    expect(sanitizeUpforgeScoreBreakdown({ ...api, inputs: [api.inputs[0], { key: 'x', label: 'X', percentile: 'high', weight: 1 }] })!.inputs).toHaveLength(1)
  })
})

describe('breakdown wording', () => {
  it('ordinals', () => {
    expect([1, 2, 3, 11, 12, 13, 21, 72, 100].map(ordinal)).toEqual(['1st', '2nd', '3rd', '11th', '12th', '13th', '21st', '72nd', '100th'])
  })
  it('one plain row per input with the rank and its share', () => {
    const rows = breakdownRows(sanitizeUpforgeScoreBreakdown(api)!)
    expect(rows[0]).toEqual({ key: 'acs', text: 'ACS · 72nd percentile for Platinum', percentile: 72, share: '30% of the score' })
    expect(rows[2].share).toBe('25% of the score')
  })
  it('names who the match was compared with', () => {
    expect(baselineLine({ source: 'tier', tier: 'platinum', samples: 1240 })).toBe('Compared with 1,240 Platinum players')
    expect(baselineLine({ source: 'all', tier: null, samples: 300 })).toBe('Compared with 300 players of all ranks')
    expect(baselineLine({ source: 'prior', tier: 'gold', samples: null })).toMatch(/^Early estimate/)
    const all = breakdownRows(sanitizeUpforgeScoreBreakdown({ ...api, baseline: { source: 'all', tier: null, samples: 300 } })!)
    expect(all[0].text).toBe('ACS · 72nd percentile across all ranks')
    const prior = breakdownRows(sanitizeUpforgeScoreBreakdown({ ...api, baseline: { source: 'prior', tier: 'gold', samples: 0 } })!)
    expect(prior[0].text).toBe('ACS · 72nd percentile')
  })
})

describe('averageLine', () => {
  it('names the rank only when the baseline is that rank', () => {
    expect(averageLine({ source: 'tier', tier: 'gold', samples: 4120 })).toBe('500 is average for Gold')
  })
  it('says all ranks when the baseline pools every rank', () => {
    expect(averageLine({ source: 'all', tier: null, samples: 900 })).toBe('500 is average across all ranks')
    expect(averageLine({ source: 'all', tier: 'gold', samples: 900 })).not.toMatch(/Gold|your rank/)
  })
  it('claims no group for the early estimate or a missing breakdown', () => {
    expect(averageLine({ source: 'prior', tier: 'gold', samples: null })).not.toMatch(/rank|Gold/)
    expect(averageLine(null)).toBe('500 is an average game')
  })
  it('the match report uses it instead of a fixed "your rank" line', () => {
    const vue = readFileSync(resolve(__dirname, '../views/v3/MatchReportV3.vue'), 'utf8')
    expect(vue).not.toMatch(/500 is average for your rank/)
    expect(vue).toMatch(/averageLine\(view\.value\?\.upforgeScoreBreakdown\?\.baseline\)/)
  })
})
