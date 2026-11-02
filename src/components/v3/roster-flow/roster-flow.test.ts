import { describe, expect, it } from 'vitest'
import {
  coachReplies, markReplySeen, newReplyIds, parseCoachInvite, readJoinCoachLater, readSeenReplies, replySentence,
  setJoinCoachLater,
  sendStateFor, coachBadgeCounts, sendLabel, showStudentsNav, replyTitle, unseenReplies, type StudentHub,
} from './roster-flow'

class Mem implements Storage {
  private m = new Map<string, string>()
  get length() { return this.m.size }
  clear() { this.m.clear() }
  getItem(k: string) { return this.m.get(k) ?? null }
  key(i: number) { return [...this.m.keys()][i] ?? null }
  removeItem(k: string) { this.m.delete(k) }
  setItem(k: string, v: string) { this.m.set(k, v) }
}

const NOW = Date.parse('2026-10-30T12:00:00Z')
const hub = (over: Partial<StudentHub> = {}): StudentHub => ({
  coaches: [{ coach_id: 7, display_name: 'Coach Vex', avatar_url: null, current_rank: 'Radiant', can_request_review: true }],
  pending_reviews: [{ id: 11, status: 'in_progress', coach: { display_name: 'Coach Vex' }, analysis: { id: 501, map: 'Bind' } }],
  recent_completed: [
    { id: 9, status: 'completed', completed_at: '2026-10-20T10:00:00Z', coach: { display_name: 'Coach Vex' }, analysis: { id: 400, map: 'Ascent', rounds_won: 13, rounds_lost: 9 } },
    { id: 10, status: 'completed', completed_at: '2026-10-29T10:00:00Z', coach: { display_name: 'Coach Vex' }, analysis: { id: 450, map: 'Sunset', rounds_won: 9, rounds_lost: 13 } },
    { id: 3, status: 'completed', completed_at: '2026-09-01T10:00:00Z', coach: { display_name: 'Coach Vex' }, analysis: { id: 100, map: 'Bind' } },
  ],
  ...over,
})

describe('parseCoachInvite', () => {
  it('reads the coach id from the link a coach shares, or a bare id', () => {
    expect(parseCoachInvite('https://upforge.gg/coaches/123#join-roster')).toBe(123)
    expect(parseCoachInvite('http://localhost:3000/coaches/45?membership=paid#join-roster')).toBe(45)
    expect(parseCoachInvite('/coaches/9')).toBe(9)
    expect(parseCoachInvite(' 77 ')).toBe(77)
  })
  it('rejects anything that is not a coach invite', () => {
    expect(parseCoachInvite('')).toBeNull()
    expect(parseCoachInvite('https://upforge.gg/coaches/abc')).toBeNull()
    expect(parseCoachInvite('https://upforge.gg/coaches/123456789012')).toBeNull()
    expect(parseCoachInvite('https://upforge.gg/coaches-x/12')).toBeNull()
    expect(parseCoachInvite('0')).toBeNull()
  })
})

describe('coach replies', () => {
  it('lists completed reviews newest first with a plain sentence', () => {
    const r = coachReplies(hub())
    expect(r.map(x => x.reviewId)).toEqual([10, 9, 3])
    expect(replySentence(r[0])).toBe('Coach Vex left notes on your Sunset 9–13 match.')
    expect(replyTitle(r[0])).toBe('Coach Vex replied')
  })
  it('hides replies already opened and older than two weeks', () => {
    expect(unseenReplies(hub(), new Set([10]), NOW).map(r => r.reviewId)).toEqual([9])
  })
  it('remembers opened replies across visits', () => {
    const s = new Mem()
    markReplySeen(10, s)
    expect([...readSeenReplies(s)]).toEqual([10])
  })
  it('notifies only for replies that were not there before', () => {
    expect(newReplyIds(new Set([9, 3]), hub())).toEqual([10])
  })
})

describe('sendStateFor', () => {
  it('is hidden without a coach or an analysis', () => {
    expect(sendStateFor(hub({ coaches: [] }), 1).kind).toBe('hidden')
    expect(sendStateFor(hub(), null).kind).toBe('hidden')
  })
  it('says a review already exists instead of offering a second send', () => {
    expect(sendStateFor(hub(), 501)).toEqual({ kind: 'already', status: 'in_progress', coachName: 'Coach Vex' })
    expect(sendStateFor(hub(), 450).kind).toBe('already')
  })
  it('explains when every coach is at a limit', () => {
    const blocked = hub({ coaches: [{ coach_id: 7, display_name: 'Coach Vex', can_request_review: false, can_request_reason: 'Monthly limit reached' }] })
    expect(sendStateFor(blocked, 999)).toEqual({ kind: 'blocked', reason: 'Monthly limit reached', coachName: 'Coach Vex', code: null })
  })
  it('is ready with the coach list otherwise', () => {
    const s = sendStateFor(hub(), 999)
    expect(s.kind).toBe('ready')
    if (s.kind === 'ready') expect(s.coaches[0].display_name).toBe('Coach Vex')
  })
})

describe('nav split (Option A)', () => {
  it('splits the badge by job: Coaches = unopened notes, Students = matches waiting for your notes', () => {
    expect(coachBadgeCounts(2, [{ status: 'pending' }, { status: 'in_progress' }, { status: 'completed' }])).toEqual({ coaches: 2, students: 2 })
    expect(coachBadgeCounts(0, null)).toEqual({ coaches: 0, students: 0 })
    expect(coachBadgeCounts(-1, [{ status: 'pending' }])).toEqual({ coaches: 0, students: 1 })
  })

  it('shows Students only for accounts with a coach profile', () => {
    expect(showStudentsNav(true)).toBe(true)
    expect(showStudentsNav(false)).toBe(false)
    expect(showStudentsNav(null)).toBe(false)
    expect(showStudentsNav(undefined)).toBe(false)
  })

  it('names the coach on send buttons', () => {
    expect(sendLabel([{ display_name: 'astar' }])).toBe('Send to astar')
    expect(sendLabel([{ display_name: 'astar' }, { display_name: 'Crystalf1sh' }])).toBe('Send to a coach')
    expect(sendLabel([{ display_name: 'astar' }, { display_name: 'Crystalf1sh', can_request_review: false }])).toBe('Send to astar')
  })
})

describe('join-coach reminder', () => {
  it('is off by default, can be set during onboarding and cleared on join or dismiss', () => {
    const s = new Mem()
    expect(readJoinCoachLater(s)).toBe(false)
    setJoinCoachLater(true, s)
    expect(readJoinCoachLater(s)).toBe(true)
    setJoinCoachLater(false, s)
    expect(readJoinCoachLater(s)).toBe(false)
  })
})
