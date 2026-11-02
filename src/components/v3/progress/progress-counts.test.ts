import { describe, expect, it } from 'vitest'
import { analysedEmptyLine, progressCountLine } from './progress-counts'

describe('progressCountLine', () => {
  it('names both counts so the header never contradicts the chart and habits', () => {
    expect(progressCountLine(14, 0)).toBe('14 games checked · 0 analysed')
    expect(progressCountLine(1, 1)).toBe('1 game checked · 1 analysed')
  })
  it('falls back to analysed matches only when checked games are unknown', () => {
    expect(progressCountLine(null, 1)).toBe('1 analysed match in this range')
    expect(progressCountLine(null, 3)).toBe('3 analysed matches in this range')
  })
  it('never shows Valorant focus checks for another game', () => {
    for (const game of ['cs2', 'deadlock', 'lol']) {
      expect(progressCountLine(61, 0, game)).toBe('0 analysed matches in this range')
    }
    expect(progressCountLine(61, 0, 'valorant')).toBe('61 games checked · 0 analysed')
  })
})

describe('analysedEmptyLine', () => {
  const NOW = Date.parse('2026-11-02T12:00:00Z')
  it('says when the last analysed match was', () => {
    expect(analysedEmptyLine('2026-09-25T12:00:00Z', NOW)).toBe('No analysed matches in this range. Your last one was 38 days ago; pick a longer range to see it.')
    expect(analysedEmptyLine('2026-11-01T11:00:00Z', NOW)).toContain('yesterday')
  })
  it('has an honest line when there are none at all', () => {
    expect(analysedEmptyLine(null, NOW)).toBe('No analysed matches yet. Play a match with recording on to get one.')
  })
})
