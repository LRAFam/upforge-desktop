import { describe, expect, it } from 'vitest'
import { agentFullPortrait, analysedThisWeek, coachLine, daysAgo, dedupeByMatch, focusTitleParts, formSquareLabel, heroMetaParts, heroScore, homeMapLabel, homeStateNote, liveStatus, pickPrimaryAction, relativeDay, resultTone, resultWord } from './home-v3'

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
  it('never repeats the hero result line; uses the match verdict when the AI wrote one', () => {
    expect(coachLine(null, null, { verdict: 'You keep re-peeking angles teammates just died on.' }))
      .toEqual({ headline: 'You keep re-peeking angles teammates just died on.', next: '', source: 'verdict' })
    expect(coachLine(null, null, { verdict: null }))
      .toEqual({ headline: 'Open your last match to see what decided it.', next: '', source: 'last_match' })
    expect(coachLine(null, null, { verdict: '  ' })?.source).toBe('last_match')
    expect(coachLine(null, null, null)).toBeNull()
  })
  it('puts the match verdict ahead of an older insight, but behind the focus note', () => {
    expect(coachLine(null, { text: 'old insight' }, { verdict: 'Verdict.' })?.source).toBe('verdict')
    expect(coachLine(note('Note.'), { text: 'old insight' }, { verdict: 'Verdict.' })?.source).toBe('focus_note')
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
  it('gives the hero and the welcome-back note the same day count', () => {
    const now = Date.parse('2026-11-02T09:00:00Z')
    const iso = '2026-09-24T21:27:16.000000Z'
    expect(relativeDay(iso, now)).toBe('39 days ago')
    expect(daysAgo(iso, now)).toBe(39)
    expect(homeStateNote([{ created_at: iso }], now)?.line).toContain('39 days ago')
  })
})

describe('dedupeByMatch', () => {
  it('keeps the newest analysis of a match that was analysed more than once', () => {
    const rows = [
      { id: 639, match_id: 'summit' },
      { id: 634, match_id: 'ascent' },
      { id: 633, match_id: 'ascent' },
      { id: 632, match_id: 'ascent' },
      { id: 10, match_id: null },
      { id: 9, match_id: null },
    ]
    expect(dedupeByMatch(rows).map(r => r.id)).toEqual([639, 634, 10, 9])
  })
})

describe('labels', () => {
  const label = (m: string) => m
  it('labels each recent-form square with map, score and result', () => {
    expect(formSquareLabel({ won: true, map: 'Summit', rounds_won: 13, rounds_lost: 10, overall_score: 60, hs_pct: null }, label)).toBe('Summit · 13–10 · Win')
    expect(formSquareLabel({ won: null, map: null, rounds_won: null, rounds_lost: null, overall_score: null, hs_pct: null }, label)).toBe('Match · Result unknown')
  })
  it('shows CS2 display map names', () => {
    expect(homeMapLabel('cs2', 'de_vertigo', label)).toBe('Vertigo')
    expect(homeMapLabel('cs2', 'maps/de_dust2', label)).toBe('Dust2')
    expect(homeMapLabel('valorant', 'Ascent', m => `V:${m}`)).toBe('V:Ascent')
    expect(homeMapLabel('cs2', null, label)).toBe('')
  })
  it('drops the CS2 player name and source label from the hero meta', () => {
    const a = { map: 'de_vertigo', agent: 'LRAFam', game_mode: 'CS2 VOD', created_at: '' }
    expect(heroMetaParts('cs2', a, 'Vertigo', m => String(m))).toEqual(['Vertigo'])
    expect(heroMetaParts('valorant', { ...a, map: 'Summit', agent: 'Fade', game_mode: 'competitive' }, 'Summit', () => 'Competitive')).toEqual(['Summit', 'Fade', 'Competitive'])
  })
  it('splits the focus into a Plex title and a short goal with a whole percent', () => {
    expect(focusTitleParts({ label: 'Opening deaths in the first 10s', better: 'lower', target: 0.11, progress: { status: 'active' } }))
      .toEqual({ title: 'Opening deaths in the first 10s', goal: 'At most 11%' })
    expect(focusTitleParts({ label: 'Deaths traded', better: 'higher', target: 0.305, progress: { status: 'achieved' } }).title).toBe('Focus achieved: deaths traded')
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
  it('points at finished coaching the player has not opened yet', () => {
    expect(liveStatus({ ...idle, ready: { count: 1, label: 'Jett', map: 'Ascent' } })).toEqual({
      kind: 'ready', text: 'Coaching ready · Jett on Ascent', action: 'review' })
    expect(liveStatus({ ...idle, ready: { count: 3, label: 'Jett', map: null } })?.text).toBe('3 coaching reviews ready')
    // Still says what else is running, but the review is the action.
    expect(liveStatus({ ...idle, analyses: 1, ready: { count: 1, label: 'Jett', map: null } })).toEqual({
      kind: 'ready', text: 'Coaching ready · Jett · Coach is analysing your match', action: 'review' })
    // Recording still wins.
    expect(liveStatus({ ...idle, recording: true, ready: { count: 1, label: 'Jett', map: null } })?.kind).toBe('recording')
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

describe('matchTime (audit 2026-11-02)', () => {
  it('prefers the API played_at over when the match was analysed', async () => {
    const { matchTime } = await import('./home-v3')
    expect(matchTime({ played_at: '2026-09-05T18:00:00Z', created_at: '2026-09-24T10:00:00Z' })).toBe('2026-09-05T18:00:00Z')
    expect(matchTime({ played_at: null, created_at: '2026-09-24T10:00:00Z' })).toBe('2026-09-24T10:00:00Z')
  })
})
