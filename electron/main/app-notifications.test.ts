import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shown: string[] = []
vi.mock('electron', () => {
  class Notification {
    static isSupported() { return true }
    constructor(private o: { title: string }) {}
    on() { return this }
    show() { shown.push(this.o.title) }
    close() {}
  }
  return { Notification }
})

describe('showAppNotification while recording', () => {
  beforeEach(() => { vi.useFakeTimers(); shown.length = 0; vi.resetModules() })
  afterEach(() => vi.useRealTimers())

  it('drops normal toasts during a recording', async () => {
    const m = await import('./app-notifications')
    m.setMatchRecordingGuard(() => true)
    m.showAppNotification({ title: 'A', body: 'x' })
    vi.advanceTimersByTime(60_000)
    expect(shown).toEqual([])
  })

  it('shows a deferred toast once the recording ends', async () => {
    const m = await import('./app-notifications')
    let recording = true
    m.setMatchRecordingGuard(() => recording)
    m.showAppNotification({ title: 'Coaching ready', body: 'x', deferWhileRecording: true })
    vi.advanceTimersByTime(30_000)
    expect(shown).toEqual([])
    recording = false
    vi.advanceTimersByTime(5_000)
    expect(shown).toEqual(['Coaching ready'])
    vi.advanceTimersByTime(30_000)
    expect(shown).toEqual(['Coaching ready'])
  })
})
