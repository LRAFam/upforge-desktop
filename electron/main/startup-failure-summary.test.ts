import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartupFailureSummary, fileSeenStore, summariseStartupFailures } from './startup-failure-summary'

function make(seen: string[] = []) {
  const notify = vi.fn()
  const logActivity = vi.fn()
  const store = { ids: [...seen], load: () => store.ids, save: (ids: string[]) => { store.ids = ids } }
  const s = new StartupFailureSummary({ notify, logActivity, loadSeen: store.load, saveSeen: store.save, settleMs: 1000, windowMs: 60_000 })
  return { s, notify, logActivity, store }
}

describe('StartupFailureSummary', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('shows ONE notification + ONE activity entry for several startup failures', () => {
    const { s, notify, logActivity } = make()
    s.begin()
    s.note({ key: 'analysis:j1', kind: 'analysis' })
    s.note({ key: 'analysis:j2', kind: 'analysis' })
    s.note({ key: 'upload:r1', kind: 'upload' })
    expect(notify).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(notify).toHaveBeenCalledTimes(1)
    expect(logActivity).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].body).toContain('2 analyses failed')
    expect(notify.mock.calls[0][0].body).toContain('1 upload was interrupted')
  })

  it('never notifies twice for the same item (persisted across restarts)', () => {
    const first = make()
    first.s.begin()
    first.s.note({ key: 'analysis:j1', kind: 'analysis' })
    vi.advanceTimersByTime(1000)
    expect(first.notify).toHaveBeenCalledTimes(1)

    const second = make(first.store.ids)
    second.s.begin()
    second.s.note({ key: 'analysis:j1', kind: 'analysis' })
    vi.advanceTimersByTime(5000)
    expect(second.notify).not.toHaveBeenCalled()
    expect(second.logActivity).not.toHaveBeenCalled()
  })

  it('ignores the same item noted twice in one startup', () => {
    const { s, notify } = make()
    s.begin()
    s.note({ key: 'analysis:j1', kind: 'analysis' })
    s.note({ key: 'analysis:j1', kind: 'analysis' })
    vi.advanceTimersByTime(1000)
    expect(notify.mock.calls[0][0].body).toContain('1 analysis failed')
  })

  it('only collects during the startup window (live failures have their own notices)', () => {
    const { s, notify } = make()
    s.note({ key: 'analysis:early', kind: 'analysis' }) // before begin
    s.begin()
    vi.advanceTimersByTime(60_001)
    s.note({ key: 'analysis:late', kind: 'analysis' })
    vi.advanceTimersByTime(5000)
    expect(notify).not.toHaveBeenCalled()
  })

  it('begin() is once per app run (re-login does not reopen the window)', () => {
    const { s, notify } = make()
    s.begin()
    vi.advanceTimersByTime(60_001)
    s.begin()
    s.note({ key: 'analysis:j9', kind: 'analysis' })
    vi.advanceTimersByTime(5000)
    expect(notify).not.toHaveBeenCalled()
  })

  it('summary copy', () => {
    expect(summariseStartupFailures({ analysis: 1, upload: 0 })).toBe('While UpForge was closed, 1 analysis failed. Open UpForge to retry.')
    expect(summariseStartupFailures({ analysis: 0, upload: 3 })).toBe('While UpForge was closed, 3 uploads were interrupted. Open UpForge to retry.')
  })
})

describe('fileSeenStore', () => {
  it('round-trips and caps the id list', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sfs-'))
    const store = fileSeenStore(path.join(dir, 'seen.json'), 3)
    expect(store.load()).toEqual([])
    store.save(['a', 'b', 'c', 'd'])
    expect(store.load()).toEqual(['b', 'c', 'd'])
    fs.writeFileSync(path.join(dir, 'seen.json'), 'not json')
    expect(store.load()).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
