import { describe, expect, it } from 'vitest'
import { liveEventsIndicateGameplay, waitForLiveGameplayCue } from './live-gameplay-wait'

describe('liveEventsIndicateGameplay', () => {
  it('detects GameStart / RoundStart', () => {
    expect(liveEventsIndicateGameplay([{ EventName: 'GameStart', EventTime: 0 }])).toBe(true)
    expect(liveEventsIndicateGameplay([{ EventName: 'RoundStart', EventTime: 1 }])).toBe(true)
  })

  it('detects late EventTime as past load', () => {
    expect(liveEventsIndicateGameplay([{ EventName: 'Something', EventTime: 8 }])).toBe(true)
    expect(liveEventsIndicateGameplay([{ EventName: 'Something', EventTime: 2 }])).toBe(false)
  })

  it('returns false for empty', () => {
    expect(liveEventsIndicateGameplay([])).toBe(false)
    expect(liveEventsIndicateGameplay(null)).toBe(false)
  })
})

describe('waitForLiveGameplayCue', () => {
  it('returns false quickly when Live Client probe fails', async () => {
    const result = await waitForLiveGameplayCue({
      maxMs: 5_000,
      getJson: async () => {
        throw new Error('ECONNREFUSED')
      },
    })
    expect(result).toBe(false)
  })

  it('does not hang past maxMs when a probe never settles', async () => {
    const started = Date.now()
    const result = await waitForLiveGameplayCue({
      maxMs: 80,
      getJson: () => new Promise(() => { /* hang forever */ }),
    })
    const elapsed = Date.now() - started
    expect(result).toBe(false)
    expect(elapsed).toBeLessThan(500)
  })

  it('returns true when eventdata shows GameStart', async () => {
    let calls = 0
    const result = await waitForLiveGameplayCue({
      maxMs: 2_000,
      pollMs: 10,
      getJson: async <T>(path: string): Promise<T> => {
        calls++
        if (path.includes('activeplayer')) return {} as T
        return { Events: [{ EventName: 'GameStart', EventTime: 0 }] } as T
      },
    })
    expect(result).toBe(true)
    expect(calls).toBeGreaterThanOrEqual(2)
  })
})
