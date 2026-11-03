import { describe, expect, it } from 'vitest'
import { insightForGame, type LastInsight } from './last-insight'

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
