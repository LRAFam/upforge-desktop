import { describe, expect, it } from 'vitest'
import {
  chooseVideoSource, daysLeft, expiringSoonLine, keepTimeLine, parseRetention, parseRetentionSummary, postGameCloudLine, retentionLine,
} from './cloud-retention'

const NOW = Date.parse('2026-11-10T12:00:00Z')
const countdown = (days: number | null, extra: Record<string, unknown> = {}) => parseRetention({
  state: 'countdown', expires_at: '2026-11-19T12:00:00Z', days_left: days, reason: 'free_plan', kept_while_subscribed: false, video_stored: true, ...extra,
})!

describe('parseRetention', () => {
  it('returns null when the field is missing or malformed (older API)', () => {
    for (const bad of [undefined, null, 'countdown', {}, { state: 'deleted' }, { state: 5 }]) expect(parseRetention(bad)).toBeNull()
  })
  it('a removed video is never stored, whatever the flag says', () => {
    expect(parseRetention({ state: 'removed', video_stored: true })?.video_stored).toBe(false)
  })
  it('drops unknown reasons and bad dates', () => {
    const r = parseRetention({ state: 'countdown', expires_at: 'soon', days_left: -1, reason: 'oops' })!
    expect(r).toMatchObject({ expires_at: null, days_left: null, reason: null, video_stored: true })
  })
})

describe('retentionLine', () => {
  it('says the countdown in days (9, 1, 0)', () => {
    expect(retentionLine(countdown(9), NOW)?.text).toBe('Removed from cloud in 9 days')
    expect(retentionLine(countdown(1), NOW)?.text).toBe('Removed from cloud in 1 day')
    expect(retentionLine(countdown(0), NOW)?.text).toBe('Removed from cloud today')
  })
  it('falls back to expires_at when days_left is missing', () => {
    expect(daysLeft(countdown(null), NOW)).toBe(9)
    expect(retentionLine(countdown(null), NOW)?.text).toBe('Removed from cloud in 9 days')
  })
  it('warns at 7 days or fewer and offers keep + download', () => {
    expect(retentionLine(countdown(7), NOW)).toMatchObject({ tone: 'warn', countdown: true })
    expect(retentionLine(countdown(12), NOW)).toMatchObject({ tone: 'quiet', countdown: true })
  })
  it('explains over-quota and ended-plan countdowns with the contract copy', () => {
    expect(retentionLine(countdown(9, { reason: 'over_quota' }), NOW)?.detail).toBe('Your cloud space is full, so this video is only kept for 14 days.')
    expect(retentionLine(countdown(3, { reason: 'payment_ended' }), NOW)?.detail).toBe('Your plan ended. Removed from cloud in 3 days unless you renew.')
  })
  it('kept while subscribed has no countdown', () => {
    expect(retentionLine(parseRetention({ state: 'kept', kept_while_subscribed: true }), NOW)).toMatchObject({ text: "Kept in the cloud while you're subscribed", countdown: false })
  })
  it('removed says the full video is gone', () => {
    expect(retentionLine(parseRetention({ state: 'removed' }), NOW)).toMatchObject({ text: 'Full video no longer stored', removed: true, countdown: false })
  })
  it('says nothing before launch or when the field is missing', () => {
    expect(retentionLine(parseRetention({ state: 'not_started' }), NOW)).toBeNull()
    expect(retentionLine(undefined, NOW)).toBeNull()
    expect(retentionLine(null, NOW)).toBeNull()
  })
})

describe('chooseVideoSource', () => {
  it('prefers the file on this PC, even when the cloud copy was removed', () => {
    expect(chooseVideoSource({ hasLocalFile: true, inCloud: true, retention: parseRetention({ state: 'removed' }) })).toBe('local')
    expect(chooseVideoSource({ hasLocalFile: true, inCloud: false })).toBe('local')
  })
  it('uses the cloud copy while it is stored', () => {
    expect(chooseVideoSource({ hasLocalFile: false, inCloud: true, retention: countdown(3) })).toBe('cloud')
    expect(chooseVideoSource({ hasLocalFile: false, inCloud: true })).toBe('cloud')
  })
  it('has no video when the cloud copy is removed and nothing is on this PC', () => {
    expect(chooseVideoSource({ hasLocalFile: false, inCloud: true, retention: parseRetention({ state: 'removed' }) })).toBe('none')
    expect(chooseVideoSource({ hasLocalFile: false, inCloud: false })).toBe('none')
  })
})

describe('summary', () => {
  const raw = {
    started: true, tier: 'free', keep_days: 14, kept_while_subscribed: false, grace_days: 30,
    included_bytes: 5e9, addon_bytes: 0, capacity_bytes: 5e9, used_bytes: 1234, remaining_bytes: 5e9 - 1234,
    over_quota: false, saves_paused: false, saves_paused_message: null, next_removal_at: null,
    expiring_soon: [
      { kind: 'recording', id: 'a', map: 'Ascent', agent: 'Jett', game: 'valorant', bytes: 10, retention: { state: 'countdown', days_left: 3, expires_at: '2026-11-13T12:00:00Z' } },
      { kind: 'analysis_video', id: 42, map: null, agent: null, game: 'cs2', bytes: 5, retention: { state: 'countdown', days_left: 1 } },
      { kind: 'clip', id: 'x', retention: { state: 'countdown', days_left: 1 } },
    ],
    pack: { gb: 50, cents: 499 },
  }
  it('parses and keeps only full-video items', () => {
    const s = parseRetentionSummary(raw)
    expect(s.expiring_soon.map(i => i.id)).toEqual(['a', '42'])
    expect(s.pack).toEqual({ gb: 50, cents: 499 })
  })
  it('throws on a non-summary body', () => {
    expect(() => parseRetentionSummary({})).toThrow()
    expect(() => parseRetentionSummary(null)).toThrow()
  })
  it('shows no countdowns before launch', () => {
    expect(parseRetentionSummary({ ...raw, started: false }).expiring_soon).toEqual([])
  })
  it('keep time per plan', () => {
    expect(keepTimeLine(parseRetentionSummary(raw))).toBe('Free: each video kept 14 days')
    expect(keepTimeLine(parseRetentionSummary({ ...raw, tier: 'premium', keep_days: null, kept_while_subscribed: true }))).toBe("Kept while you're subscribed")
    expect(keepTimeLine(null)).toBeNull()
  })
  it('expiring soon warning says the count and the soonest day', () => {
    expect(expiringSoonLine(parseRetentionSummary(raw), NOW)).toBe('2 videos leave the cloud soon · first in 1 day')
    expect(expiringSoonLine(parseRetentionSummary({ ...raw, expiring_soon: [] }), NOW)).toBeNull()
  })
  it('only keeps the paused message while saves are paused', () => {
    expect(parseRetentionSummary({ ...raw, saves_paused: false, saves_paused_message: 'x' }).saves_paused_message).toBeNull()
    expect(parseRetentionSummary({ ...raw, saves_paused: true, saves_paused_message: 'Full.' }).saves_paused_message).toBe('Full.')
  })
  it('post-game says the keep time only when the video will be removed', () => {
    expect(postGameCloudLine(parseRetentionSummary(raw))).toBe('Free plan: this video stays in the cloud for 14 days.')
    expect(postGameCloudLine(parseRetentionSummary({ ...raw, saves_paused: true, over_quota: true }))).toBe('Your cloud space is full, so this video is only kept for 14 days.')
    expect(postGameCloudLine(parseRetentionSummary({ ...raw, keep_days: null, kept_while_subscribed: true }))).toBeNull()
    expect(postGameCloudLine(parseRetentionSummary({ ...raw, keep_days: null, kept_while_subscribed: true, over_quota: true }))).toBe('Your cloud space is full, so this video is only kept for 14 days.')
    expect(postGameCloudLine(parseRetentionSummary({ ...raw, started: false }))).toBeNull()
    expect(postGameCloudLine(null)).toBeNull()
  })
})

describe('keep_time (removal dates switched off)', () => {
  const keep = (extra: Record<string, unknown> = {}) => parseRetention({ state: 'keep_time', expires_at: null, days_left: null, keep_days: 14, reason: 'free_plan', ...extra })
  it('says the keep time softly with no date or "Removed in"', () => {
    const l = retentionLine(keep(), NOW)!
    expect(l).toMatchObject({ text: 'Kept for 14 days on Free', tone: 'quiet', countdown: true, keepTime: true, detail: null })
    expect(l.text).not.toMatch(/Removed|today|\d{4}|Nov/)
  })
  it('payment ended and over quota copy', () => {
    expect(retentionLine(keep({ reason: 'payment_ended', keep_days: 30 }), NOW)?.text).toBe('Kept for 30 days after your plan ended')
    expect(retentionLine(keep({ reason: 'over_quota' }), NOW)?.text).toBe('Cloud space full · kept for 14 days')
  })
  it('falls back to 14 days (30 after a plan ends) when keep_days is missing', () => {
    expect(retentionLine(keep({ keep_days: undefined }), NOW)?.text).toBe('Kept for 14 days on Free')
    expect(retentionLine(keep({ keep_days: null, reason: 'payment_ended' }), NOW)?.text).toBe('Kept for 30 days after your plan ended')
  })
  it('still plays from the cloud', () => {
    expect(chooseVideoSource({ hasLocalFile: false, inCloud: true, retention: keep() })).toBe('cloud')
  })
  it('the summary warns only for dated countdowns while removal dates are shown', () => {
    const base = { started: true, tier: 'free', keep_days: 14 }
    const items = [
      { kind: 'recording', id: 'a', retention: { state: 'keep_time', keep_days: 14 } },
      { kind: 'recording', id: 'b', retention: { state: 'countdown', days_left: 2 } },
    ]
    expect(parseRetentionSummary({ ...base, expiring_soon: items }).expiring_soon.map(i => i.id)).toEqual(['b'])
    expect(parseRetentionSummary({ ...base, removal_dates_shown: false, expiring_soon: items }).expiring_soon).toEqual([])
    expect(expiringSoonLine(parseRetentionSummary({ ...base, removal_dates_shown: false, expiring_soon: items }), NOW)).toBeNull()
  })
})
