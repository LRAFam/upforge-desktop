import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eventTiming, formatTimingSeconds } from './vod-event-timing'

describe('eventTiming', () => {
  it("treats Valorant's detected −8 s as no adjustment", () => {
    expect(eventTiming(-8000, -8000)).toEqual({ adjustmentMs: 0, adjusted: false, adjustmentLabel: 'None' })
  })
  it('shows only the player’s own change', () => {
    expect(eventTiming(-11000, -8000)).toMatchObject({ adjustmentMs: -3000, adjusted: true, adjustmentLabel: '−3.0 s' })
    expect(eventTiming(1500, 0)).toMatchObject({ adjustmentMs: 1500, adjustmentLabel: '+1.5 s' })
  })
  it('ignores store rounding noise and missing values', () => {
    expect(eventTiming(-7990, -8000).adjusted).toBe(false)
    expect(eventTiming(undefined, undefined).adjusted).toBe(false)
    expect(eventTiming(Number.NaN, 0).adjusted).toBe(false)
  })
  it('formats seconds with a real minus sign', () => {
    expect(formatTimingSeconds(-500)).toBe('−0.5 s')
    expect(formatTimingSeconds(0)).toBe('0.0 s')
  })
})

describe('Event timing control', () => {
  const src = readFileSync(resolve(__dirname, '../components/vod-review/VodEventTimingControl.vue'), 'utf8')
  const body = readFileSync(resolve(__dirname, '../components/vod-review/VodReviewBody.vue'), 'utf8')
  it('offers a one-click reset and says what moves', () => {
    expect(src).toMatch(/Reset to detected timing/)
    expect(src).toMatch(/resetTimelineSync/)
    expect(src).toMatch(/The video doesn't move/)
  })
  it('is the one control under the player and in Map intel', () => {
    expect(body.match(/<VodEventTimingControl/g)?.length).toBe(3)
  })
})
