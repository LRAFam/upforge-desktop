import { describe, expect, it } from 'vitest'
import {
  allowanceLine, blockedLine, COACHES_PROMISE, coachesHeadline, draftLine, initial, limitPct, planLabel, resultTone, rosterMemberLine,
  roundScore, sendBlockedText, settingsSummaryText, studentsHeadline, studentsSummary, waitingPhrase,
} from './coach-format'

describe('coach-format', () => {
  it('caps limit bars and survives missing limits', () => {
    expect(limitPct(3, 4)).toBe(75)
    expect(limitPct(9, 4)).toBe(100)
    expect(limitPct(1, 0)).toBe(0)
    expect(limitPct(null, 4)).toBe(0)
  })

  it('formats scores and results from real fields only', () => {
    expect(roundScore(9, 13)).toBe('9–13')
    expect(roundScore(null, 13)).toBeNull()
    expect(resultTone({ rounds_won: 13, rounds_lost: 8 })).toBe('win')
    expect(resultTone({ rounds_won: 9, rounds_lost: 13 })).toBe('loss')
    expect(resultTone({ won: false })).toBe('loss')
    expect(resultTone({})).toBeNull()
  })

  it('gives an initial or a placeholder', () => {
    expect(initial('rook')).toBe('R')
    expect(initial('')).toBe('?')
  })

  it('summarises Students in plain words (roster-wide cap apart from the per-student allowance)', () => {
    expect(studentsSummary(2, 'free', 9.99, { roster_reviews_this_month: 0, roster_reviews_limit: 8 })).toBe('2 students · free plan · 0 of 8 reviews used this month')
    expect(studentsSummary(1, 'paid', 9.99, { roster_reviews_this_month: 5, roster_reviews_limit: null })).toBe('1 student · $9.99 a month plan · 5 reviews this month')
    expect(studentsSummary(0, 'free', 0, null)).toBe('0 students · free plan · 0 reviews this month')
    expect(settingsSummaryText('free', 9.99, 3, false)).toBe('Student plan: free · 3 reviews per student a month')
    expect(settingsSummaryText('paid', 9.99, 1, true)).toBe('Student plan: $9.99 a month · 1 review per student a month · needs setup')
    expect(studentsHeadline(0)).toBe('Queue is clear')
    expect(studentsHeadline(1)).toBe('1 match needs your notes')
    expect(studentsHeadline(3)).toBe('3 matches need your notes')
    expect(draftLine('payouts')).toContain('payouts')
    expect(draftLine(null)).toBe('Almost live. Finish setup on upforge.gg.')
  })

  it('names human coaches and never uses roster jargon on the student side', () => {
    expect(planLabel({ membership_is_paid: true })).toBe('Paid plan')
    expect(planLabel({ roster_membership_mode: 'free' })).toBe('Free plan')
    expect(allowanceLine('astar', { active_reviews: 1, active_reviews_limit: 1, reviews_this_month: 1, reviews_month_limit: 3 })).toBe('1 match with astar now · 2 left this month')
    expect(allowanceLine('astar', { active_reviews: 0, active_reviews_limit: 1, reviews_this_month: 5, reviews_month_limit: 3 })).toBe('Nothing with astar now · 0 left this month')
    expect(allowanceLine('astar', undefined)).toBeNull()
    expect(blockedLine('astar', 'student_active_limit', null, 'Summit')).toBe('You can send again when astar finishes Summit.')
    expect(blockedLine('astar', 'student_monthly_limit')).toBe('You’ve sent astar all your matches for this month. More next month.')
    expect(blockedLine('astar', 'roster_closed')).toBe('astar isn’t taking matches right now.')
    expect(blockedLine('astar', 'weird', 'API reason')).toBe('API reason')
    expect(sendBlockedText([
      { name: 'Crystalf1sh', code: 'student_active_limit', waitingMap: 'Lotus' },
      { name: 'astar', code: 'student_active_limit', waitingMap: 'Summit' },
    ])).toBe('You can send again when Crystalf1sh finishes Lotus or astar finishes Summit.')
    expect(sendBlockedText([{ name: 'a', code: 'student_active_limit' }, { name: 'b', code: 'roster_closed' }]))
      .toBe('You can send again when a finishes your last match. b isn’t taking matches right now.')
    expect(waitingPhrase('astar', 'Summit', 'pending')).toBe('astar has your Summit match')
    expect(waitingPhrase('Crystalf1sh', 'Lotus', 'in_progress')).toBe('Crystalf1sh is reviewing Lotus')
    for (const line of [allowanceLine('a', { active_reviews: 1, active_reviews_limit: 1, reviews_this_month: 0, reviews_month_limit: 3 }), blockedLine('a', 'roster_closed'), COACHES_PROMISE]) {
      expect(line).not.toMatch(/roster|community/i)
    }
  })

  it('puts the real state in the Coaches H1: notes ready › waiting › send › your coaches', () => {
    const base = { coachCount: 2, unseenNotes: [], waiting: [], canSend: false, sendTo: null }
    expect(coachesHeadline({ ...base, coachCount: 0 })).toEqual({ title: 'Get notes from a real coach', sub: COACHES_PROMISE })
    expect(coachesHeadline({ ...base, unseenNotes: [{ coachName: 'astar' }], waiting: ['x'] }).title).toBe('astar left you notes')
    expect(coachesHeadline({ ...base, unseenNotes: [{ coachName: 'a' }, { coachName: 'b' }] }).title).toBe('2 matches have new notes')
    expect(coachesHeadline({ ...base, waiting: ['astar has your Summit match', 'Crystalf1sh is reviewing Lotus'] }))
      .toEqual({ title: '2 matches waiting for notes', sub: 'astar has your Summit match · Crystalf1sh is reviewing Lotus' })
    expect(coachesHeadline({ ...base, canSend: true, sendTo: 'astar' }).title).toBe('Send your last match to astar')
    expect(coachesHeadline({ ...base, canSend: true }).title).toBe('Send your last match to a coach')
    expect(coachesHeadline(base).title).toBe('Your coaches')
  })

  it('builds the member line without repeating open reviews', () => {
    expect(rosterMemberLine({ games_analysed: 15, membership_tier: 'free', last_active_at: null })).toBe('15 analysed · Free plan')
  })
})
