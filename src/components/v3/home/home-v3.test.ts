import { describe, expect, it } from 'vitest'
import { agentFullPortrait, analysedThisWeek, coachLine, heroScore, homeStateNote, liveStatus, pickPrimaryAction, relativeDay, resultTone, resultWord } from './home-v3'

describe('pickPrimaryAction', () => {
  it('opens the last match whenever there is one', () => {
    expect(pickPrimaryAction({ hasMatch: true, obsConnected: false, isValorant: true })).toBe('open_last_match')
  })
  it('asks for recording setup when nothing is recorded and OBS is off', () => {
    expect(pickPrimaryAction({ hasMatch: false, obsConnected: false, isValorant: true })).toBe('setup_recording')
  })
  it('checks Riot matches for Valorant when recording is ready but no match exists yet', () => {
    expect(pickPrimaryAction({ hasMatch: false, obsConnected: true, isValorant: true })).toBe('check_matches')
    expect(pickPrimaryAction({ hasMatch: false, obsConnected: true, isValorant: false })).toBe('setup_recording')
  })
})

describe('match facts', () => {
  it('only shows a score when both round counts exist', () => {
    expect(heroScore({ rounds_won: 9, rounds_lost: 13 })).toEqual({ won: 9, lost: 13 })
    expect(heroScore({ rounds_won: 9, rounds_lost: null })).toBeNull()
    expect(heroScore(null)).toBeNull()
  })
  it('maps results to tone and word without guessing unknowns', () => {
    expect([resultTone(true), resultTone(false), resultTone(null)]).toEqual(['win', 'loss', 'none'])
    expect([resultWord(true), resultWord(false), resultWord(undefined)]).toEqual(['VICTORY', 'DEFEAT', ''])
  })
})

describe('coachLine', () => {
  it('talks about the real last match when there is no note, never "set up recording"', () => {
    expect(coachLine(null, null, { won: true, mapLabel: 'Summit', roundsWon: 13, roundsLost: 10 }))
      .toEqual({ headline: 'Your last match was a win on Summit, 13–10.', next: 'Open it to see what decided it.', source: 'last_match' })
    expect(coachLine(null, null, { won: null, mapLabel: null, roundsWon: null, roundsLost: null })?.headline).toBe('Your last match is analysed.')
    expect(coachLine(null, null, { won: false, mapLabel: 'Bind', roundsWon: 9, roundsLost: 13 })?.headline).toBe('Your last match was a loss on Bind, 9–13.')
    expect(coachLine(null, null, null)).toBeNull()
  })
  const note = (headline?: string, next?: string) => ({
    match_id: 'm', focus: null, focus_event: null,
    report: { notes: { headline: headline ? { finding_id: 'a', text: headline } : undefined, next_action: next ? { finding_id: 'b', text: next } : undefined } },
  })
  it('prefers the latest focus note and its next step', () => {
    expect(coachLine(note('You died first in 8 rounds.', 'Hold the opening.'), { text: 'old insight' }))
      .toEqual({ headline: 'You died first in 8 rounds.', next: 'Hold the opening.', source: 'focus_note' })
  })
  it('falls back to the last analysis insight, then to nothing', () => {
    expect(coachLine(note(), { text: 'Crosshair too low.' })).toEqual({ headline: 'Crosshair too low.', next: '', source: 'insight' })
    expect(coachLine(null, null)).toBeNull()
  })
})

describe('helpers', () => {
  it('derives the full portrait from the bust icon URL', () => {
    expect(agentFullPortrait('https://x/agents/abc/displayicon.png')).toBe('https://x/agents/abc/fullportrait.png')
    expect(agentFullPortrait('')).toBe('')
  })
  it('formats relative days', () => {
    const now = Date.parse('2026-10-30T12:00:00Z')
    expect(relativeDay('2026-10-30T10:00:00Z', now)).toBe('2h ago')
    expect(relativeDay('2026-10-29T10:00:00Z', now)).toBe('yesterday')
    expect(relativeDay('nope', now)).toBe('')
  })
})

describe('liveStatus', () => {
  const idle = { recording: false, waitingForMatch: false, uploadPct: null, uploads: 0, analysisPct: null, analyses: 0 }
  it('is quiet when nothing is happening', () => {
    expect(liveStatus(idle)).toBeNull()
  })
  it('puts recording first, with a stop action', () => {
    expect(liveStatus({ ...idle, recording: true, elapsed: '12:03', analyses: 1 })).toEqual({ kind: 'recording', text: 'Recording · 12:03', action: 'stop' })
  })
  it('combines upload and analysis progress and points to Matches', () => {
    expect(liveStatus({ ...idle, uploadPct: 41.6, analyses: 1, analysisPct: 60 })).toEqual({
      kind: 'working', text: 'Uploading · 42% · Coach is analysing · 60%', action: 'matches' })
    expect(liveStatus({ ...idle, uploads: 2, analyses: 3 })?.text).toBe('Uploading 2 recordings · Coach is analysing 3 matches')
  })
  it('says when the game is open but the match has not started', () => {
    expect(liveStatus({ ...idle, waitingForMatch: true })).toMatchObject({ kind: 'waiting', action: null })
  })
})

describe('analysedThisWeek', () => {
  it('counts only the last 7 days and ignores bad dates', () => {
    const now = Date.parse('2026-10-30T12:00:00Z')
    expect(analysedThisWeek([
      { created_at: '2026-10-30T10:00:00Z' }, { created_at: '2026-10-24T13:00:00Z' },
      { created_at: '2026-10-20T10:00:00Z' }, { created_at: null }, { created_at: 'nope' },
    ], now)).toBe(2)
  })
})

describe('homeStateNote (board 13)', () => {
  const NOW = Date.parse('2026-10-30T12:00:00Z')
  const at = (daysAgo: number) => ({ created_at: new Date(NOW - daysAgo * 86_400_000).toISOString() })
  it('is an early read with a whole-number sample size under 10 matches', () => {
    expect(homeStateNote([at(1), at(2), at(3)], NOW)).toEqual({
      kind: 'early_read', label: 'Early read · 3 matches',
      line: 'Numbers show how many matches they come from until you have 10.',
    })
    expect(homeStateNote([at(1)], NOW)?.label).toBe('Early read · 1 match')
  })
  it('welcomes a player back after 14 days away, with the real gap', () => {
    expect(homeStateNote([at(20), at(21)], NOW)).toMatchObject({ kind: 'returning', line: expect.stringContaining('20 days ago') })
  })
  it('says nothing for a regular player or with no data', () => {
    expect(homeStateNote(Array.from({ length: 12 }, (_, i) => at(i)), NOW)).toBeNull()
    expect(homeStateNote([], NOW)).toBeNull()
    expect(homeStateNote([{ created_at: null }], NOW)).toBeNull()
  })
})
