import { describe, expect, it, vi } from 'vitest'
import { UsageTracker, type UsageEvent } from './product-usage'
import { desktopUsageFeature } from './setup-product-usage'
function harness() {
  let time = 0; let id = 0
  const delivered: UsageEvent[] = []
  const send = vi.fn(async (_user: number, events: UsageEvent[]) => { delivered.push(...events) })
  const tracker = new UsageTracker({ now: () => time, uuid: () => `id-${++id}`, send, failed: vi.fn() })
  return { tracker, send, delivered, advance: (ms: number) => { time += ms } }
}
const settle = async () => { await Promise.resolve(); await Promise.resolve() }
describe('observed usage contract', () => {
  it('excludes idle, hidden, and sleep intervals from time', async () => {
    const h = harness()
    h.tracker.sample(1, 'report', true); await settle()
    for (let n = 0; n < 6; n++) { h.advance(5000); h.tracker.sample(1, 'report', true); await settle() }
    h.advance(5000); h.tracker.sample(1, 'report', false); await settle()
    h.advance(120000); h.tracker.sample(1, 'report', false); await settle()
    h.advance(5000); h.tracker.sample(1, 'report', true); await settle()
    h.advance(300000); h.tracker.sample(1, 'report', true); await settle()
    expect(h.delivered.reduce((n, e) => n + e.active_ms, 0)).toBe(30000)
  })
  it('counts repeat views, attributes previous-page time and rotates idle sessions', async () => {
    const h = harness()
    h.tracker.sample(1, 'report', true); await settle()
    h.advance(5000); h.tracker.sample(1, 'match_stats', true, true); await settle()
    expect(h.delivered.find(e => e.event === 'engagement')).toMatchObject({ feature: 'report', active_ms: 5000 })
    h.advance(5000); h.tracker.sample(1, 'report', true, true); await settle()
    expect(h.delivered.filter(e => e.event === 'page_view' && e.feature === 'report')).toHaveLength(2)
    h.advance(1_800_001); h.tracker.sample(1, 'report', true); await settle()
    expect(h.delivered.filter(e => e.event === 'session_started')).toHaveLength(2)
  })
  it('retries stable event IDs and never transfers queued data between users', async () => {
    const h = harness()
    h.send.mockRejectedValueOnce(new Error('offline'))
    h.tracker.sample(1, 'report', true); await settle()
    const first = h.send.mock.calls[0][1]
    h.advance(30000); h.tracker.sample(1, 'report', true); await settle()
    expect(h.send.mock.calls[1][1]).toEqual(first)
    h.send.mockRejectedValueOnce(new Error('offline'))
    h.tracker.action('report'); await settle()
    h.tracker.sample(2, 'dashboard', true); await settle()
    expect(h.send.mock.calls.at(-1)?.[0]).toBe(2)
    expect(h.send.mock.calls.at(-1)?.[1].every(e => e.feature === 'dashboard')).toBe(true)
  })
  it('ignores logged-out users and excluded routes', async () => {
    const h = harness()
    h.tracker.sample(null, 'dashboard', true)
    h.advance(5000); h.tracker.sample(1, null, true)
    h.tracker.action('report'); await settle()
    expect(h.send).not.toHaveBeenCalled()
    expect(desktopUsageFeature('/overlay')).toBeNull()
    expect(desktopUsageFeature('/vod-review')).toBe('report')
    expect(desktopUsageFeature('/stats')).toBe('match_stats')
  })
})
