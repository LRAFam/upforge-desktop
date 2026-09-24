import { describe, expect, it, vi } from 'vitest'
vi.mock('electron-log', () => ({ default: { debug: vi.fn() } }))
import { ProductActivityTracker } from './product-activity'

describe('ProductActivityTracker', () => {
  it('isolates accounts, drops stale owners and suppresses bursts', async () => {
    let userId: number | null = 1
    const send = vi.fn(async () => {})
    const tracker = new ProductActivityTracker({ userId: () => userId, send, now: () => 1000 })
    await tracker.track('clip_created', 'valorant', 1)
    await tracker.track('clip_created', 'valorant', 1)
    expect(send).toHaveBeenCalledTimes(1)
    userId = 2
    await tracker.track('clip_created', 'valorant', 1)
    expect(send).toHaveBeenCalledTimes(1)
    await tracker.track('clip_created', 'valorant', 2)
    expect(send).toHaveBeenCalledTimes(2)
    userId = null
    await tracker.track('clip_created', 'valorant')
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('allows future observations after a failed delivery and never throws', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const tracker = new ProductActivityTracker({ userId: () => 1, send, now: () => 1000 })
    expect(await tracker.track('recording_saved', 'cs2')).toBe(false)
    expect(await tracker.track('recording_saved', 'cs2')).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
  })
  it('observes again after five minutes and across UTC midnight', async () => {
    let now = Date.parse('2026-09-19T23:59:59Z')
    const send = vi.fn(async () => {})
    const tracker = new ProductActivityTracker({ userId: () => 1, send, now: () => now })
    await tracker.track('app_foreground', 'unknown')
    now += 2000
    await tracker.track('app_foreground', 'unknown')
    now += 300_001
    await tracker.track('app_foreground', 'unknown')
    expect(send).toHaveBeenCalledTimes(3)
  })
})
