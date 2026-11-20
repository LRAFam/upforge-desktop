import { describe, expect, it, vi } from 'vitest'

const made: Array<{ opts: Record<string, unknown>; handlers: Record<string, (...a: unknown[]) => void> }> = []
vi.mock('electron', () => {
  class Notification {
    static isSupported() { return true }
    handlers: Record<string, (...a: unknown[]) => void> = {}
    constructor(opts: Record<string, unknown>) { made.push({ opts, handlers: this.handlers }) }
    on(ev: string, fn: (...a: unknown[]) => void) { this.handlers[ev] = fn; return this }
    show() {}
    close() {}
  }
  return { Notification }
})

describe('showAppNotification buttons', () => {
  it('passes buttons and reports the pressed index', async () => {
    const m = await import('./app-notifications')
    const onAction = vi.fn()
    m.showAppNotification({ title: 'Warm up first?', body: 'Head Height Corridor, 2 minutes', actions: ['Start', 'Not today'], onAction })
    expect(made[0].opts.actions).toEqual([{ type: 'button', text: 'Start' }, { type: 'button', text: 'Not today' }])
    made[0].handlers.action({ actionIndex: 1 })
    expect(onAction).toHaveBeenCalledWith(1)
  })

  it('is dropped while a match records', async () => {
    const m = await import('./app-notifications')
    m.setMatchRecordingGuard(() => true)
    const before = made.length
    m.showAppNotification({ title: 'Warm up first?', body: 'x', actions: ['Start'], onAction: () => {} })
    expect(made.length).toBe(before)
  })
})
