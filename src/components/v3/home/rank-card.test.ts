import { describe, expect, it } from 'vitest'
import { rankCardLines } from './rank-card'

describe('rank card (shareable proof)', () => {
  it('celebrates a climb with whole RR numbers', () => {
    expect(rankCardLines({ rankName: 'Platinum 1', rr: 42, change: 18, playerName: 'LRAFam#1337', dateLabel: '30 Oct 2026' }))
      .toEqual({ eyebrow: 'Climbing with UpForge', title: 'Platinum 1', sub: '42 RR · +18 RR last match' })
  })
  it('stays neutral after a loss or with no change', () => {
    expect(rankCardLines({ rankName: 'Gold 3', rr: 5, change: -15, playerName: null, dateLabel: '' }).sub).toBe('5 RR · −15 RR last match')
    expect(rankCardLines({ rankName: 'Gold 3', rr: null, change: null, playerName: null, dateLabel: '' }))
      .toEqual({ eyebrow: 'Current rank', title: 'Gold 3', sub: 'Ranked' })
  })
})
