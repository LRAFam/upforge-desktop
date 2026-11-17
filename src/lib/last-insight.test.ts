import { describe, expect, it } from 'vitest'
import { insightForGame, insightText, normalizeLastInsight, type LastInsight } from './last-insight'

const valorant = { text: 'Reyna: stop dismissing into nothing', score: 6, agent: 'Reyna', analysisId: 1, date: '2026-11-02', game: 'valorant' }
const legacy: LastInsight = { text: 'Reyna note', score: 6, agent: 'Reyna', analysisId: 2, date: '2026-10-01' }

describe('insightForGame', () => {
  it('never shows a Valorant insight on another game', () => {
    for (const game of ['cs2', 'deadlock', 'lol']) {
      expect(insightForGame(valorant, game)).toBeNull()
      expect(insightForGame(legacy, game)).toBeNull()
    }
  })

  it('shows it on its own game (legacy entries count as Valorant)', () => {
    expect(insightForGame(valorant, 'valorant')).toBe(valorant)
    expect(insightForGame(legacy, 'valorant')).toBe(legacy)
    expect(insightForGame({ ...valorant, game: 'cs2' }, 'cs2')).toMatchObject({ game: 'cs2' })
  })
})

// Crash report: League analyses return priority_improvements as objects ({ theme, issue, fix }),
// which were saved as lastInsight.text; the Home "train" action then called text.toLowerCase().
describe('insightText', () => {
  it('keeps plain strings (trimmed)', () => {
    expect(insightText('  Trade your flash for the kill  ')).toBe('Trade your flash for the kill')
  })

  it('reads the issue from a League improvement object', () => {
    expect(insightText({ theme: 'CS', issue: '72 CS at 10', fix: 'Last-hit under tower' })).toBe('72 CS at 10')
  })

  it('uses the first usable entry of an array', () => {
    expect(insightText([{ theme: '' }, { issue: 'Warded late', fix: 'Ward at 2:45' }])).toBe('Warded late')
    expect(insightText(['', 'Second note'])).toBe('Second note')
  })

  it('returns null for null, missing, numbers and objects without text', () => {
    for (const raw of [null, undefined, '', '   ', 42, {}, { theme: 'CS' }, [], [null]]) {
      expect(insightText(raw)).toBeNull()
    }
  })
})

describe('normalizeLastInsight', () => {
  const base = { score: 6, agent: null, analysisId: 3, date: '2026-11-15', game: 'lol' }

  it('repairs a saved insight whose text is an object', () => {
    const saved = { ...base, text: { theme: 'CS', issue: '72 CS at 10', fix: 'Last-hit under tower' } }
    const out = normalizeLastInsight(saved)
    expect(out?.text).toBe('72 CS at 10')
    expect(() => out?.text.toLowerCase()).not.toThrow()
  })

  it('drops saved insights with no usable text', () => {
    expect(normalizeLastInsight({ ...base, text: null })).toBeNull()
    expect(normalizeLastInsight({ ...base })).toBeNull()
    expect(normalizeLastInsight({ ...base, text: ['', {}] })).toBeNull()
    expect(normalizeLastInsight(null)).toBeNull()
    expect(normalizeLastInsight('nope')).toBeNull()
  })

  it('leaves a valid insight unchanged', () => {
    expect(normalizeLastInsight(valorant)).toEqual(valorant)
  })
})
