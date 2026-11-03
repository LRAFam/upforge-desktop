import { describe, expect, it, vi } from 'vitest'
import {
  DIAGNOSTIC_DAILY_CAP,
  DIAGNOSTIC_MIN_INTERVAL_MS,
  createDiagnosticReporter,
  redactDiagnosticLine,
  type DiagnosticContext,
  type DiagnosticRateState,
} from './diagnostic-reporter'

const MIN = 60_000

function setup(opts: { context?: Partial<DiagnosticContext>; state?: DiagnosticRateState | null; enabled?: boolean } = {}) {
  let clock = 1_000_000_000
  let saved: DiagnosticRateState | null = opts.state ?? null
  const send = vi.fn()
  const report = createDiagnosticReporter({
    send,
    enabled: opts.enabled,
    now: () => clock,
    platform: 'win32',
    arch: 'x64',
    context: () => ({ game: 'cs2', recordingCount: 12, activity: [], ...opts.context }),
    loadState: () => saved,
    saveState: (s) => { saved = s },
  })
  return {
    report,
    send,
    advance: (ms: number) => { clock += ms },
    saved: () => saved,
    now: () => clock,
  }
}

describe('createDiagnosticReporter rate limiting', () => {
  it('sends at most one report per kind per 10 minutes', () => {
    const t = setup()
    expect(t.report({ kind: 'main_stall', stallMs: 4000 })).toBe(true)
    t.advance(MIN)
    expect(t.report({ kind: 'main_stall', stallMs: 9000 })).toBe(false)
    // A different kind has its own window.
    expect(t.report({ kind: 'call_burst', label: 'recordings:get', callCount: 36, windowS: 61 })).toBe(true)
    t.advance(DIAGNOSTIC_MIN_INTERVAL_MS)
    expect(t.report({ kind: 'main_stall', stallMs: 3500 })).toBe(true)
    expect(t.send).toHaveBeenCalledTimes(3)
  })

  it('ignores short stalls (main.log still has them)', () => {
    const t = setup()
    expect(t.report({ kind: 'main_stall', stallMs: 1500 })).toBe(false)
    expect(t.send).not.toHaveBeenCalled()
  })

  it('caps reports per day across kinds', () => {
    const t = setup()
    let sent = 0
    for (let i = 0; i < DIAGNOSTIC_DAILY_CAP + 5; i++) {
      if (t.report({ kind: 'call_burst', label: `label-${i}`, callCount: 40, windowS: 60 })) sent++
    }
    expect(sent).toBe(DIAGNOSTIC_DAILY_CAP)
    t.advance(24 * 60 * MIN)
    expect(t.report({ kind: 'call_burst', label: 'label-0', callCount: 40, windowS: 60 })).toBe(true)
  })

  it('keeps the limit across restarts via the saved state', () => {
    const first = setup()
    first.report({ kind: 'main_stall', stallMs: 5000 })
    const restarted = setup({ state: first.saved() })
    // Same clock origin: the restarted reporter still sees the report from a moment ago.
    expect(restarted.report({ kind: 'main_stall', stallMs: 5000 })).toBe(false)
    expect(restarted.send).not.toHaveBeenCalled()
  })

  it('survives a corrupt state file', () => {
    const t = setup({ state: { lastSentByKey: 'nope', sentAt: null } as unknown as DiagnosticRateState })
    expect(t.report({ kind: 'main_stall', stallMs: 5000 })).toBe(true)
  })

  it('does nothing when disabled (dev builds)', () => {
    const t = setup({ enabled: false })
    expect(t.report({ kind: 'main_stall', stallMs: 10_000 })).toBe(false)
    expect(t.send).not.toHaveBeenCalled()
  })
})

describe('diagnostic payload', () => {
  it('carries game, counts and redacted recent activity only', () => {
    const t = setup({
      context: {
        game: 'cs2',
        recordingCount: 7,
        activity: [
          { time: 1, message: 'old line dropped' },
          { time: 2, message: 'Recording started (WINGMAN)' },
          { time: 3, message: 'Saved to C:\\Users\\Adam Downing\\Videos\\UpForge\\match.mp4' },
          { time: 4, message: 'Unknown Riot ID Big Adam#EUW1. Link it before recording.' },
          { time: 5, message: 'Steam 76561198012345678 user adam@example.com' },
          { time: 6, message: 'Opened /Users/adam/Movies/UpForge/clip.mp4 and /Volumes/Games/UpForge' },
        ],
      },
    })
    t.report({ kind: 'call_burst', label: 'recordings:get', callCount: 36, windowS: 61 })
    const payload = t.send.mock.calls[0]![0]
    expect(payload.message).toBe('[MainLag] recordings:get reload burst')
    expect(payload.component).toBe('diagnostic:main-lag')
    expect(payload.extra).toMatchObject({
      category: 'diagnostic',
      kind: 'call_burst',
      game: 'cs2',
      recording_count: 7,
      call_count: 36,
      window_s: 61,
      os: 'win32',
      arch: 'x64',
    })
    const lines = payload.extra.recent_activity.map((a: { message: string }) => a.message)
    expect(lines).toHaveLength(5)
    expect(lines[0]).toBe('Recording started (WINGMAN)')
    const all = JSON.stringify(payload)
    for (const leak of ['Adam Downing', 'Big Adam', 'EUW1', '76561198012345678', 'adam@example.com', '/Users/adam', 'Volumes', 'match.mp4']) {
      expect(all).not.toContain(leak)
    }
    expect(all).not.toMatch(/user_(id|email|name)/)
  })

  it('uses one stable message for stalls so the API groups them', () => {
    const t = setup()
    t.report({ kind: 'main_stall', stallMs: 3210.6 })
    const payload = t.send.mock.calls[0]![0]
    expect(payload.message).toBe('[MainLag] main process stall')
    expect(payload.extra.stall_ms).toBe(3211)
  })
})

describe('redactDiagnosticLine', () => {
  it('strips ids, uuids, puuids and paths', () => {
    expect(redactDiagnosticLine('recording 0c3f1e2a-1b2c-4d5e-8f90-123456789abc ready')).toBe('recording [id] ready')
    expect(redactDiagnosticLine('puuid Zk3xQ1n_abcdefghijklmnopqrstuvwxyz0123456789-ABCDEFG done')).toBe('puuid [id] done')
    expect(redactDiagnosticLine('match 3456789012 account 123456789')).toBe('match [id] account [id]')
    expect(redactDiagnosticLine('D:\\Games\\UpForge clips full')).toBe('[redacted-path]')
    expect(redactDiagnosticLine('Analysis ready — 7/10')).toBe('Analysis ready — 7/10')
  })
})
