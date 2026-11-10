import { expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))
import { buildFirstBloodByRound } from './riot-local-api'

it('omits first-blood timing when the event has no usable game time', () => {
  for (const time of [undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER, -1]) {
    expect(buildFirstBloodByRound([{ killer: 'ally', victim: 'enemy', round: 1, timeSinceGameStartMillis: time }]).size).toBe(0)
  }
})

it('keeps the earliest timed combat kill without substituting a sentinel', () => {
  const events = [
    { killer: 'ally', victim: 'enemy', round: 1 },
    { killer: 'ally', victim: 'enemy', round: 1, timeSinceGameStartMillis: 30_000 },
    { killer: 'ally', victim: 'enemy', round: 1, timeSinceGameStartMillis: 20_000 },
  ]
  expect(buildFirstBloodByRound(events).get(1)?.tsgm).toBe(20_000)
})
