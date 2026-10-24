import { describe, expect, it } from 'vitest'
import { focusHeadline, focusSlots, focusSubline, focusSyncMessage, focusTransitionText, hydrateFocusResponse, pct, type Focus, type FocusResponse, type FocusUpdate } from './focus'

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
