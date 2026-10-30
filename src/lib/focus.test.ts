import { describe, expect, it } from 'vitest'
import { decidedStats, focusBeforeAfter, deriveRoundFacts, sanitizeRoundFacts, focusHeadline, focusSlots, focusSubline, focusSyncMessage, focusTransitionText, hydrateFocusResponse, pct, type Focus, type FocusResponse, type FocusUpdate } from './focus'

const base: Focus = {
  id: 1, metric: 'opening_death_rate', label: 'Opening deaths', better: 'lower', baseline: 0.364, target: 0.22,
  checks: [{ match_id: 'a', value: 0.18, hit: true, played_at: null }],
  progress: { games_played: 1, hits: 1, games_required: 3, hits_required: 2, status: 'active' },
  started_at: null, completed_at: null,
}

describe('focus display', () => {
  it('formats rates and slots', () => {
    expect(pct(0.364)).toBe('36%')
    expect(pct(null)).toBe('—')
    expect(focusSlots(base)).toEqual(['hit', 'pending', 'pending'])
  })
  it('describes active, achieved and missed focuses', () => {
    expect(focusHeadline(base)).toBe('Opening deaths under 22%')
    expect(focusSubline(base)).toBe('Started at 36%. Hit it in 1 more of your next 2 games.')
    const done = { ...base, progress: { ...base.progress, games_played: 2, hits: 2, status: 'achieved' } }
    expect(focusHeadline(done)).toBe('Focus achieved: opening deaths under 22%')
    const higher = { ...base, better: 'higher' as const, label: 'Deaths traded', target: 0.26 }
    expect(focusHeadline(higher)).toBe('Deaths traded over 26%')
  })
})

const update: FocusUpdate = {
  focus: base, focus_event: 'checked', match_id: 'a',
  report: { notes: { headline: { finding_id: 'opening', text: 'Stay alive for the trade.' }, next_action: { finding_id: 'opening', text: 'Wait for your teammate.' } } },
}
const response: FocusResponse = { success: true, focus: base, history: [], notes_usage: { used: 1, limit: 10 } }

describe('restoring focus reports', () => {
  it('restores the matching report while keeping the API focus authoritative', () => {
    const refreshed = { ...base, progress: { ...base.progress, status: 'achieved' } }
    const result = hydrateFocusResponse({ ...response, focus: refreshed }, update)
    expect(result.latest?.report?.notes?.next_action?.text).toBe('Wait for your teammate.')
    expect(result.focus?.progress.status).toBe('achieved')
    expect(result.latest?.focus?.progress.status).toBe('achieved')
  })

  it('does not attach stale notes after the API rotates or clears the focus', () => {
    expect(hydrateFocusResponse({ ...response, focus: { ...base, id: 2 } }, update).latest).toBeNull()
    expect(hydrateFocusResponse({ ...response, focus: null }, update).latest).toBeNull()
  })

  it('does not show an older match report when another device has added a check', () => {
    const newer = { ...base, checks: [...base.checks, { ...base.checks[0], match_id: 'newer' }] }
    expect(hydrateFocusResponse({ ...response, focus: newer }, update).latest).toBeNull()
  })

  it('restores notes for a newly created focus before its first check', () => {
    const created = { ...base, checks: [] }
    expect(hydrateFocusResponse({ ...response, focus: created }, { ...update, focus: created }).latest?.report).toEqual(update.report)
  })

  it('explains observed completion without inventing an outcome for an active previous focus', () => {
    const next = { ...update, focus: { ...base, id: 2 }, previous_focus: base }
    expect(focusTransitionText(next)).toBe('Your focus changed from Opening deaths under 22% after a new match.')
    expect(focusTransitionText({ ...next, previous_focus: { ...base, progress: { ...base.progress, status: 'achieved' } } })).toContain('You achieved your previous focus')
    expect(focusTransitionText({ ...next, previous_focus: { ...base, progress: { ...base.progress, status: 'missed' } } })).toContain('ended without reaching its target')
  })
})

describe('focus sync messages', () => {
  it.each([
    ['sync_in_progress', 'already being checked'],
    ['not_your_match', 'does not match'],
    ['http_502', 'AI service'],
    ['http_500', 'could not process'],
    ['network_error', 'Could not reach'],
    ['riot_client_unavailable', 'Open Valorant'],
    ['sign_in_required', 'Sign in'],
  ])('explains %s instead of reporting an empty sync as up to date', (reason, message) => {
    expect(focusSyncMessage({ ok: false, reason, uploaded: 0, skipped: 0, latest: null })).toContain(message)
  })
})


// Round shape of the real anonymised Bind match (upforge-frontend/tests/fixtures/valorant-match-report-bind.json).
const BIND_ROUNDS = 'RRBBRBBBRBBBBBRRBRRBRB'.split('')
const BIND_FIRST_DEATHS = new Set([3, 6, 7, 8, 11, 14, 20, 21])
const bind = {
  map: 'Bind',
  finalStats: { team: 'Red' },
  finalScore: { allyScore: 9, enemyScore: 13 },
  roundSummaries: BIND_ROUNDS.map((w, i) => ({ winningTeam: w === 'R' ? 'Red' : 'Blue', playerWasFirstBlood: BIND_FIRST_DEATHS.has(i + 1) })),
}

describe('deriveRoundFacts', () => {
  it('reads the real Bind match: 9–13, died first in 8 rounds, won 1 of them', () => {
    const f = deriveRoundFacts(bind)!
    expect(f).toMatchObject({ map: 'Bind', ally: 9, enemy: 13 })
    expect(f.rounds).toHaveLength(22)
    expect(f.rounds.filter(r => r.diedFirst)).toHaveLength(8)
    expect(f.rounds.filter(r => r.diedFirst && r.won)).toHaveLength(1)
    expect(f.rounds[20]).toEqual({ won: true, diedFirst: true })
  })

  it('accepts ALLY/ENEMY rounds without a team and refuses unclear shapes', () => {
    expect(deriveRoundFacts({ roundSummaries: [{ winningTeam: 'ALLY' }, { winningTeam: 'ENEMY' }] })).toMatchObject({ ally: 1, enemy: 1 })
    expect(deriveRoundFacts({ roundSummaries: [{ winningTeam: 'Red' }] })).toBeNull() // no team to compare with
    expect(deriveRoundFacts({ roundSummaries: [{ winningTeam: null }], finalStats: { team: 'Red' } })).toBeNull()
    expect(deriveRoundFacts({ roundSummaries: [] })).toBeNull()
    expect(deriveRoundFacts(null)).toBeNull()
  })

  it('falls back to counted rounds when the final score disagrees', () => {
    const f = deriveRoundFacts({ ...bind, finalScore: { allyScore: 13, enemyScore: 9 } })!
    expect([f.ally, f.enemy]).toEqual([9, 13])
  })
})

describe('decidedStats', () => {
  it('shows only numbers that follow from the rounds', () => {
    const items = decidedStats(deriveRoundFacts(bind))
    expect(items[0]).toMatchObject({ value: '1/8', caption: 'Rounds won after you died first', tone: 'loss' })
    expect(items[0].sub).toBe('You died first in 8 of 22 rounds')
    expect(items[1]).toMatchObject({ value: '8/14' })
  })

  it('is empty when there are no facts or no first deaths', () => {
    expect(decidedStats(null)).toEqual([])
    expect(decidedStats({ map: null, ally: 1, enemy: 0, rounds: [{ won: true, diedFirst: false }] })).toEqual([])
  })
})

describe('sanitizeRoundFacts', () => {
  it('keeps valid facts and drops tampered or oversized ones', () => {
    const f = deriveRoundFacts(bind)
    expect(sanitizeRoundFacts(f)).toEqual(f)
    expect(sanitizeRoundFacts({ ...f, ally: 20 })).toBeNull()
    expect(sanitizeRoundFacts({ ...f, rounds: [{ won: 'yes', diedFirst: false }] })).toBeNull()
    expect(sanitizeRoundFacts({ map: null, ally: 41, enemy: 0, rounds: Array(41).fill({ won: true, diedFirst: false }) })).toBeNull()
    expect(sanitizeRoundFacts(undefined)).toBeNull()
  })
})

describe('focusBeforeAfter', () => {
  const base = { id: 1, metric: 'leg_hit_rate', label: 'Hits on the legs', better: 'lower' as const, baseline: 0.3, target: 0.18,
    progress: { games_played: 2, hits: 1, games_required: 3, hits_required: 2, status: 'active' }, started_at: null, completed_at: null }
  it('is null until a game has been checked', () => {
    expect(focusBeforeAfter({ ...base, checks: [] })).toBeNull()
  })
  it('compares the baseline with the average since, respecting direction', () => {
    const r = focusBeforeAfter({ ...base, checks: [{ match_id: 'a', value: 0.2, hit: false, played_at: null }, { match_id: 'b', value: 0.1, hit: true, played_at: null }] })
    expect(r).toMatchObject({ games: 2, improved: true })
    expect(r!.before).toMatch(/30/)
    expect(r!.since).toMatch(/15/)
  })
})
