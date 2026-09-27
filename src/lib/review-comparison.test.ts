import { describe, expect, it, vi } from 'vitest'
import { ReviewComparison, validComparisonLoop, comparisonPlayerLabel, type ComparisonMedia } from './review-comparison'
import { boundedMediaTime, reviewEventStart } from './review-media'

function media(time = 0, duration = 120): ComparisonMedia {
  const player = { currentTime: time, duration, paused: true, readyState: 4, playbackRate: 1,
    play: vi.fn(async () => { player.paused = false }),
    pause: vi.fn(() => { player.paused = true }),
  }
  return player
}
function setup() {
  const a = media(20, 100), b = media(60, 80)
  return { a, b, engine: new ReviewComparison(side => side === 0 ? a : b) }
}
describe('comparison playback', () => {
  it('allows independent playback and seeking without moving the other moment', async () => {
    const { a, b, engine } = setup()
    await engine.play(0)
    await engine.play(1)
    expect(a.paused).toBe(false)
    expect(b.paused).toBe(false)
    engine.seek(0, 35)
    expect(a.currentTime).toBe(35)
    expect(b.currentTime).toBe(60)
    expect(b.paused).toBe(false)
  })
  it('aligns source-relative positions and clamps both at the shorter remaining range', () => {
    const { a, b, engine } = setup()
    expect(engine.align()).toBe(true)
    engine.seek(0, 90)
    expect([a.currentTime, b.currentTime]).toEqual([40, 80])
    engine.seek(1, 0)
    expect([a.currentTime, b.currentTime]).toEqual([0, 40])
  })
  it('pauses both linked players on buffering or an ended source', async () => {
    const { a, b, engine } = setup()
    engine.align()
    expect(await engine.play(0)).toBe(true)
    engine.interrupt()
    expect(a.paused && b.paused).toBe(true)
  })
  it('does not start either linked video until both can play', async () => {
    const { a, b, engine } = setup()
    engine.align()
    b.readyState = 2
    expect(await engine.play(0)).toBe(false)
    expect(a.play).not.toHaveBeenCalled()
  })
  it('stops both if one play request rejects', async () => {
    const { a, b, engine } = setup()
    engine.align()
    b.play = vi.fn().mockRejectedValue(new Error('source expired'))
    expect(await engine.play(0)).toBe(false)
    expect(a.paused && b.paused).toBe(true)
  })
  it('does not resume a pending play after leaving comparison', async () => {
    const { a, engine } = setup()
    let finish!: () => void
    a.play = () => new Promise<void>(resolve => { finish = () => { a.paused = false; resolve() } })
    const request = engine.play(0)
    engine.pause()
    finish()
    expect(await request).toBe(false)
    expect(a.paused).toBe(true)
  })
  it('rejects missing sources and applies supported speeds to both players', () => {
    expect(new ReviewComparison(() => null).align()).toBe(false)
    const { a, b, engine } = setup()
    engine.setSpeed(0.5)
    engine.setSpeed(NaN)
    expect([a.playbackRate, b.playbackRate]).toEqual([0.5, 0.5])
  })
})
describe('media coordinate bounds shared with single review', () => {
  it('clamps valid positions and rejects unknown duration or invalid coordinates', () => {
    expect(boundedMediaTime(-1, 20)).toBe(0)
    expect(boundedMediaTime(30, 20)).toBe(20)
    expect(boundedMediaTime(4, 20)).toBe(4)
    expect(boundedMediaTime(NaN, 20)).toBeNull()
    expect(boundedMediaTime(4, Infinity)).toBeNull()
    expect(boundedMediaTime(4, 0)).toBeNull()
  })
})


describe('event selection lead-in shared by review and comparison', () => {
  it('shows the approach to a death or kill without changing objective timestamps', () => {
    expect(reviewEventStart(77, 'death')).toBe(73)
    expect(reviewEventStart(234, 'kill')).toBe(232)
    expect(reviewEventStart(245, 'plant')).toBe(245)
    expect(reviewEventStart(288, 'defuse')).toBe(288)
  })
  it('clamps early events to the start and rejects unavailable timestamps', () => {
    expect(reviewEventStart(1, 'death')).toBe(0)
    expect(reviewEventStart(NaN, 'kill')).toBeNull()
    expect(reviewEventStart(-1, 'death')).toBeNull()
  })
})


describe('comparison start points and group transport', () => {
  it('links to explicit starts rather than the current playheads', () => {
    const { a, b, engine } = setup()
    expect(engine.align([10, 40])).toBe(true)
    engine.seek(0, 13)
    expect([a.currentTime, b.currentTime]).toEqual([13, 43])
    engine.seek(0, engine.anchors[0])
    expect([a.currentTime, b.currentTime]).toEqual([10, 40])
  })
  it('rejects starts outside either source', () => {
    const { engine } = setup()
    expect(engine.align([10, 90])).toBe(false)
    expect(engine.align([NaN, 10])).toBe(false)
    expect(engine.linked).toBe(false)
  })
  it('plays both independent sources without replacing their positions', async () => {
    const { a, b, engine } = setup()
    expect(await engine.playBoth()).toBe(true)
    expect(a.paused || b.paused).toBe(false)
    expect(engine.linked).toBe(false)
    expect([a.currentTime, b.currentTime]).toEqual([20, 60])
    engine.pause()
    expect(a.paused && b.paused).toBe(true)
  })
  it('does not partially start a group when one source has ended', async () => {
    const { a, b, engine } = setup()
    b.currentTime = b.duration
    expect(await engine.playBoth()).toBe(false)
    expect(a.play).not.toHaveBeenCalled()
  })
  it('bounds loops by the shorter remaining source and rejects empty/reversed/invalid ranges', () => {
    expect(validComparisonLoop([20, 60], [100, 80], 0, 8)).toBe(true)
    expect(validComparisonLoop([20, 60], [100, 80], 0, 20)).toBe(true)
    expect(validComparisonLoop([20, 60], [100, 80], 0, 21)).toBe(false)
    expect(validComparisonLoop([20, 60], [100, 80], 3, 3)).toBe(false)
    expect(validComparisonLoop([20, 60], [100, 80], 8, 2)).toBe(false)
    expect(validComparisonLoop([20, 60], [100, 80], -1, 2)).toBe(false)
    expect(validComparisonLoop([20, 60], [100, Infinity], 0, 8)).toBe(false)
  })
})

describe('comparison player identity', () => {
  const players = [{ puuid: 'self', summonerName: 'Fade', agent: 'Fade' }, { puuid: 'enemy', summonerName: 'Fade', agent: 'Fade' }]
  it('does not identify an enemy with the same agent name as the player', () => {
    expect(comparisonPlayerLabel('Fade', 'enemy', 'self', players)).toBe('Fade')
    expect(comparisonPlayerLabel('Fade', undefined, 'self', players)).toBe('Fade')
    expect(comparisonPlayerLabel('Fade', 'self', 'self', players)).toBe('You')
  })
})
