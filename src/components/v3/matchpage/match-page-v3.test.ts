import { describe, expect, it } from 'vitest'
import { coachLine, firstDeathEvent, firstDeathRounds, matchResult, roundsForLine, sideTab, statsOnlyNotice } from './match-page-v3'

const rounds = [
  { roundNumber: 0, won: true },
  { roundNumber: 1, won: false },
  { roundNumber: 2, won: false },
  { roundNumber: 3, won: true },
]
const events = [
  { type: 'death', round: 1, isFirstBlood: true, videoOffsetMs: 90_000 },
  { type: 'death', round: 2, isFirstBlood: true, videoOffsetMs: 150_000 },
  { type: 'death', round: 3, isFirstBlood: true, videoOffsetMs: 30_000 },
  { type: 'death', round: 0, isFirstBlood: false, videoOffsetMs: 10_000 },
  { type: 'kill', round: 0, isFirstBlood: true, videoOffsetMs: 5_000 },
]

describe('matchResult', () => {
  it('uses the scoreline when present', () => {
    expect(matchResult({ ally: 9, enemy: 13 }, true)).toEqual({ word: 'DEFEAT', tone: 'loss' })
    expect(matchResult({ ally: 13, enemy: 8 }, null)).toEqual({ word: 'VICTORY', tone: 'win' })
    expect(matchResult({ ally: 12, enemy: 12 }, null)).toEqual({ word: 'DRAW', tone: 'none' })
  })
  it('falls back to the final stats, or nothing', () => {
    expect(matchResult(null, true)?.word).toBe('VICTORY')
    expect(matchResult(null, false)?.tone).toBe('loss')
    expect(matchResult(null, undefined)).toBeNull()
  })
})

describe('first deaths', () => {
  it('only counts own deaths that were the round’s first blood', () => {
    expect([...firstDeathRounds(events)].sort()).toEqual([1, 2, 3])
  })
  it('marks those rounds on the rounds line in round order', () => {
    expect(roundsForLine(rounds, events)).toEqual([
      { won: true, marked: false }, { won: false, marked: true }, { won: false, marked: true }, { won: true, marked: true },
    ])
  })
  it('finds the earliest first death that has a video position', () => {
    expect(firstDeathEvent(events)?.round).toBe(3)
    expect(firstDeathEvent([{ type: 'death', round: 1, isFirstBlood: true, videoOffsetMs: null }])).toBeNull()
  })
})

describe('coachLine', () => {
  it('prefers the AI verdict, then the top issue', () => {
    expect(coachLine({ verdict: ' Slow your first peek. ', top_issue: 'x' }, rounds, events, true)).toEqual({ text: 'Slow your first peek.', source: 'coach' })
    expect(coachLine({ verdict: '', top_issue: 'Trade your entry.' }, rounds, events, true)?.text).toBe('Trade your entry.')
  })
  it('otherwise states a fact from the match data', () => {
    expect(coachLine(null, rounds, events, true)).toEqual({ text: 'You died first in 3 of 4 rounds. Your team won 1 of them.', source: 'data' })
  })
  it('says nothing when there is nothing true to say', () => {
    expect(coachLine(null, rounds, [], true)).toBeNull()
    expect(coachLine(null, [], events, true)).toBeNull()
    expect(coachLine(null, rounds, events, false)).toBeNull()
  })
})

describe('sideTab', () => {
  it('maps the side panel state to one tab', () => {
    expect(sideTab(false, false)).toBe('replay')
    expect(sideTab(true, false)).toBe('notes')
    expect(sideTab(false, true)).toBe('map')
  })
})

describe('statsOnlyNotice', () => {
  it('is null for a normal video-reviewed report', () => {
    expect(statsOnlyNotice({ report_type: 'full', is_degraded: false })).toBeNull()
    expect(statsOnlyNotice(null)).toBeNull()
  })
  it('names a stats-only report and quotes the first limitation the API listed', () => {
    const n = statsOnlyNotice({ is_degraded: true, limitations: ['', 'No duel clip could be read.'] })
    expect(n?.title).toBe('Stats-based report')
    expect(n?.limitation).toBe('No duel clip could be read.')
    expect(statsOnlyNotice({ coaching_source: 'telemetry_only' })?.limitation).toBeNull()
  })
  it('says the credit was returned only when the API confirms it', () => {
    expect(statsOnlyNotice({ is_degraded: true, credit_returned: true })?.message)
      .toBe('We couldn’t review the video. Your credit was returned. This coaching uses the match data only.')
    expect(statsOnlyNotice({ is_degraded: true })?.message).not.toMatch(/credit/i)
    expect(statsOnlyNotice({ is_degraded: true, credit_returned: 'yes' })?.message).not.toMatch(/credit/i)
  })
})
