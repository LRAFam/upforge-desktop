import { describe, expect, it } from 'vitest'
import { kdaLine, pendingDot, resultTone, resultWord, reviewPlayedAt, scoreLine, sessionStatusLabel, statItems } from './reviews-v3'

describe('reviews v3 helpers', () => {
  it('reads the result honestly, including 0/1 from the API', () => {
    expect(resultTone({ won: true, rounds_won: 13, rounds_lost: 9 })).toBe('win')
    expect(resultTone({ won: 0, rounds_won: null, rounds_lost: null })).toBe('loss')
    expect(resultTone({ won: null, rounds_won: null, rounds_lost: null })).toBe('none')
    expect(resultWord({ won: false, rounds_won: 9, rounds_lost: 13 })).toBe('LOSS')
    expect(resultWord({ won: null, rounds_won: null, rounds_lost: null })).toBe('')
  })

  it('only shows a score when both sides are known', () => {
    expect(scoreLine({ won: true, rounds_won: 13, rounds_lost: 9 })).toBe('13–9')
    expect(scoreLine({ won: true, rounds_won: 13, rounds_lost: null })).toBe('')
  })

  it('formats K/D/A and skips it when kills are unknown', () => {
    expect(kdaLine({ kills: 11, deaths: 18, assists: 3 })).toBe('11/18/3')
    expect(kdaLine({ kills: null, deaths: 4, assists: 1 })).toBe('')
  })

  it('labels session status from the analysis and coach review states', () => {
    expect(sessionStatusLabel('processing')).toBe('Coaching in progress')
    expect(sessionStatusLabel('completed', 'completed')).toBe('Coach notes ready')
    expect(sessionStatusLabel('completed', 'in_progress')).toBe('With your coach')
    expect(sessionStatusLabel('completed', null)).toBe('Reviewed')
    expect(sessionStatusLabel('failed')).toBe('Coaching failed')
  })

  it('keeps red for matches that need the player', () => {
    expect(pendingDot('action_required')).toEqual({ color: 'var(--uf-red)', live: false })
    expect(pendingDot('analysing').live).toBe(true)
    expect(pendingDot('preparing').color).toBe('var(--uf-faint)')
  })

  it('builds only the stat items that exist', () => {
    expect(statItems({ kills: 11, deaths: 18, assists: 3, combat_score: null, hs_pct: 40, acs: 145 }))
      .toEqual([{ value: '11/18/3', label: 'K/D/A' }, { value: '145', label: 'ACS' }, { value: '40%', label: 'headshots' }])
    expect(statItems({ kills: null, deaths: null, assists: null, combat_score: null, hs_pct: null })).toEqual([])
  })
})

describe('reviewPlayedAt', () => {
  it('dates a re-run review by its match, not by when it was analysed again', () => {
    const archive = new Map([[639, Date.parse('2026-09-05T00:16:53Z')]])
    expect(reviewPlayedAt({ id: 639, created_at: '2026-09-24T21:27:16Z' }, archive)).toBe(Date.parse('2026-09-05T00:16:53Z'))
    expect(reviewPlayedAt({ id: 640, created_at: '2026-09-24T21:27:16Z' }, archive)).toBe(Date.parse('2026-09-24T21:27:16Z'))
    expect(reviewPlayedAt({ id: 640, created_at: '2026-09-24T21:27:16Z' })).toBe(Date.parse('2026-09-24T21:27:16Z'))
  })
})

describe('reviewPlayedAt with played_at (audit 2026-11-02)', () => {
  it('uses the real match date when the API sends it', async () => {
    const { reviewPlayedAt } = await import('./reviews-v3')
    const ms = reviewPlayedAt({ id: 1, created_at: '2026-09-24T10:00:00Z', played_at: '2026-09-05T18:00:00Z' })
    expect(ms).toBe(Date.parse('2026-09-05T18:00:00Z'))
  })
})

describe('Coaching reviews queues and counts (UX1124-16)', () => {
  it('says when the list is the latest 50, and how many match a filter', async () => {
    const { reviewCountLine } = await import('./reviews-v3')
    expect(reviewCountLine({ shown: 50, loaded: 50 })).toBe('Showing your latest 50 reviews')
    expect(reviewCountLine({ shown: 12, loaded: 50 })).toBe('12 of your latest 50 reviews match this filter')
    expect(reviewCountLine({ shown: 7, loaded: 7 })).toBe('7 reviews')
    expect(reviewCountLine({ shown: 1, loaded: 1 })).toBe('1 review')
    expect(reviewCountLine({ shown: 2, loaded: 7 })).toBe('2 of 7 reviews match this filter')
  })
  it('shows the queue that holds the selected item', async () => {
    const { queueFor } = await import('./reviews-v3')
    expect(queueFor({ selectedReview: true, selectedWaiting: false, reviewed: 5, waiting: 5, current: 'waiting' })).toBe('reviewed')
    expect(queueFor({ selectedReview: false, selectedWaiting: true, reviewed: 5, waiting: 5, current: 'reviewed' })).toBe('waiting')
    expect(queueFor({ selectedReview: false, selectedWaiting: false, reviewed: 0, waiting: 3 })).toBe('waiting')
    expect(queueFor({ selectedReview: false, selectedWaiting: false, reviewed: 2, waiting: 3 })).toBe('reviewed')
    expect(queueFor({ selectedReview: false, selectedWaiting: false, reviewed: 2, waiting: 3, current: 'waiting' })).toBe('waiting')
  })
})
