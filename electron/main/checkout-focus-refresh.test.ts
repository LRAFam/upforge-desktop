import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHECKOUT_FOCUS_DEBOUNCE_MS,
  CHECKOUT_FOCUS_WINDOW_MS,
  createCheckoutFocusRefresh,
} from './checkout-focus-refresh'

describe('createCheckoutFocusRefresh', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-08T12:00:00Z')) })
  afterEach(() => { vi.useRealTimers() })

  it('watches for 10 minutes with a short debounce', () => {
    expect(CHECKOUT_FOCUS_WINDOW_MS).toBe(10 * 60 * 1000)
    expect(CHECKOUT_FOCUS_DEBOUNCE_MS).toBeGreaterThan(0)
    expect(CHECKOUT_FOCUS_DEBOUNCE_MS).toBeLessThanOrEqual(5000)
  })

  it('does nothing on focus before a checkout started', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = createCheckoutFocusRefresh(refresh)
    r.onFocus()
    await vi.runAllTimersAsync()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes once after a burst of focus events', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = createCheckoutFocusRefresh(refresh)
    r.checkoutStarted()
    r.onFocus(); r.onFocus(); r.onFocus()
    await vi.advanceTimersByTimeAsync(CHECKOUT_FOCUS_DEBOUNCE_MS + 10)
    expect(refresh).toHaveBeenCalledTimes(1)
    // A later return to the app refreshes again.
    r.onFocus()
    await vi.advanceTimersByTimeAsync(CHECKOUT_FOCUS_DEBOUNCE_MS + 10)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('stops refreshing 10 minutes after checkout started', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = createCheckoutFocusRefresh(refresh)
    r.checkoutStarted()
    expect(r.isWatching()).toBe(true)
    vi.setSystemTime(Date.now() + CHECKOUT_FOCUS_WINDOW_MS + 1)
    expect(r.isWatching()).toBe(false)
    r.onFocus()
    await vi.runAllTimersAsync()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('a second checkout restarts the 10-minute window', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = createCheckoutFocusRefresh(refresh)
    r.checkoutStarted()
    vi.setSystemTime(Date.now() + 9 * 60 * 1000)
    r.checkoutStarted()
    vi.setSystemTime(Date.now() + 5 * 60 * 1000)
    r.onFocus()
    await vi.advanceTimersByTimeAsync(CHECKOUT_FOCUS_DEBOUNCE_MS + 10)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('a failed refresh is swallowed and does not stop later refreshes', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    const r = createCheckoutFocusRefresh(refresh)
    r.checkoutStarted()
    r.onFocus()
    await vi.advanceTimersByTimeAsync(CHECKOUT_FOCUS_DEBOUNCE_MS + 10)
    r.onFocus()
    await vi.advanceTimersByTimeAsync(CHECKOUT_FOCUS_DEBOUNCE_MS + 10)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('cancel() drops a pending refresh (sign-out)', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    const r = createCheckoutFocusRefresh(refresh)
    r.checkoutStarted()
    r.onFocus()
    r.cancel()
    await vi.runAllTimersAsync()
    expect(refresh).not.toHaveBeenCalled()
    expect(r.isWatching()).toBe(false)
  })
})

describe('checkout focus refresh wiring', () => {
  it('arms after billing:start-checkout and reaches the renderer', async () => {
    const { readFileSync } = await import('node:fs')
    const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
    const ipc = read('./ipc/app-ipc.ts')
    expect(ipc).toMatch(/browser-window-focus/)
    expect(ipc).toMatch(/checkoutRefresh\.checkoutStarted\(\)/)
    expect(ipc).toMatch(/fetchUser\(\)/)
    expect(read('../preload/index.ts')).toMatch(/'account:billing-refreshed'/)
    expect(read('../../src/composables/useAccountUsage.ts')).toMatch(/'account:billing-refreshed'/)
  })
})
