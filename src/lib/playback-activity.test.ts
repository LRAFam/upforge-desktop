import { describe, expect, it } from 'vitest'
import { PlaybackActivityMeter } from './playback-activity'

describe('PlaybackActivityMeter', () => {
  const sample = (n: number, overrides = {}) => ({ key: 'day1|clip1', wallMs: n * 1000, mediaSeconds: n, playing: true, visible: true, seeking: false, ...overrides })
  it('requires ten seconds of actual playback and reports once per video/day', () => {
    const meter = new PlaybackActivityMeter()
    for (let n = 0; n < 10; n++) expect(meter.sample(sample(n))).toBe(false)
    expect(meter.sample(sample(10))).toBe(true)
    expect(meter.sample(sample(11))).toBe(false)
    expect(meter.sample(sample(12, { key: 'day2|clip1' }))).toBe(false)
    for (let n = 13; n < 22; n++) expect(meter.sample(sample(n, { key: 'day2|clip1' }))).toBe(false)
    expect(meter.sample(sample(22, { key: 'day2|clip1' }))).toBe(true)
  })
  it.each([{ visible: false }, { playing: false }, { seeking: true }])('does not count inactive playback %s', (state) => {
    const meter = new PlaybackActivityMeter()
    for (let n = 0; n < 60; n++) expect(meter.sample(sample(n, state))).toBe(false)
    expect(meter.sample(sample(60))).toBe(false)
  })
  it('does not count buffering, large seeks or long event gaps', () => {
    const meter = new PlaybackActivityMeter()
    for (let n = 0; n < 60; n++) expect(meter.sample(sample(n, { mediaSeconds: 0 }))).toBe(false)
    expect(meter.sample(sample(60, { mediaSeconds: 500 }))).toBe(false)
    expect(meter.sample(sample(90, { mediaSeconds: 530 }))).toBe(false)
  })
  it('counts wall time, not accelerated video time', () => {
    const meter = new PlaybackActivityMeter()
    for (let n = 0; n < 10; n++) expect(meter.sample(sample(n, { mediaSeconds: n * 2 }))).toBe(false)
    expect(meter.sample(sample(10, { mediaSeconds: 20 }))).toBe(true)
  })
})
