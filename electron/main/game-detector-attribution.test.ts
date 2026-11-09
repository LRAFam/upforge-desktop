/**
 * The game a recording belongs to comes from the detected process, never the game tab in the
 * title bar (settings.primaryGame → setWatchGame). The tab only breaks ties when two supported
 * games are running at once.
 */
import { describe, expect, it, vi } from 'vitest'
import { GameDetector } from './game-detector'

vi.mock('./steam-gsi-server', () => ({
  isGsiMatchLive: vi.fn(() => true),
  isGsiReceiving: vi.fn(() => true),
}))

const CS2 = '"cs2.exe","3","Console","1","1 K"'
const VAL = '"VALORANT.exe","1","Console","1","1 K"\n"VALORANT-Win64-Shipping.exe","2","Console","1","1 K"'

function detectorWith(stdout: string) {
  let current = stdout
  const detector = new GameDetector({ listProcesses: async () => current })
  const started: string[] = []
  const stopped: string[] = []
  detector.on('game-started', (g: string) => started.push(g))
  detector.on('game-stopped', (g: string) => stopped.push(g))
  return { detector, started, stopped, set: (next: string) => { current = next } }
}

describe('game attribution comes from the detected process', () => {
  it('CS2 played while the Valorant tab is selected is detected as CS2', async () => {
    const { detector, started } = detectorWith(CS2)
    detector.setWatchGame('valorant')
    await detector.pollOnce()
    expect(started).toEqual(['cs2'])
    expect(detector.currentGame()).toBe('cs2')
  })

  it('app started with a different tab (League) still tracks the running game', async () => {
    const { detector, started } = detectorWith(VAL)
    detector.setWatchGame('lol')
    await detector.pollOnce()
    expect(started).toEqual(['valorant'])
  })

  it('switching the tab mid-recording keeps the recording on the detected game', async () => {
    const { detector, started, stopped } = detectorWith(CS2)
    await detector.pollOnce()
    detector.setWatchGame('valorant', { deferActiveStop: true }) // recording → deferred
    await detector.pollOnce()
    expect(started).toEqual(['cs2'])
    expect(stopped).toEqual([])
    expect(detector.currentGame()).toBe('cs2')
  })

  it('switching the tab while waiting for a match never starts a flow for the tab game', async () => {
    const { detector, started } = detectorWith(CS2)
    await detector.pollOnce()
    detector.setWatchGame('valorant') // not recording: the detector re-picks from processes
    await detector.pollOnce()
    expect(new Set(started)).toEqual(new Set(['cs2']))
    expect(detector.currentGame()).toBe('cs2')
  })

  it('game switch mid-session: CS2 closes, Valorant opens → Valorant (tab still CS2)', async () => {
    const { detector, started, stopped, set } = detectorWith(CS2)
    detector.setWatchGame('cs2')
    await detector.pollOnce()
    set(VAL)
    await detector.pollOnce() // miss 1
    await detector.pollOnce() // miss 2 → stop, then pick
    expect(stopped).toEqual(['cs2'])
    expect(started).toEqual(['cs2', 'valorant'])
  })
})
