import { describe, expect, it } from 'vitest'
import { habitPolarity, isStrengthText } from './habit-polarity'

describe('habitPolarity', () => {
  it('reads clear praise or a good outcome as a strength', () => {
    expect(isStrengthText('Solid crosshair placement at head height.')).toBe(true)
    expect(isStrengthText('Head-height holds turning multi-target fights into kills.')).toBe(true)
    expect(habitPolarity({ label: 'Mechanics habits', note: 'Head-height holds turning multi-target fights into kills.' })).toBe('strength')
  })
  it('keeps anything with problem or fix language a risk', () => {
    expect(isStrengthText('Good aim but dies untraded on B long.')).toBe(false)
    expect(habitPolarity({ label: 'Positioning', note: 'Holds an open angle alone.' })).toBe('risk')
    expect(habitPolarity({ label: 'Untraded deaths', note: 'Great entry timing.' })).toBe('risk')
  })
  it('treats info-only notes as neutral', () => {
    expect(habitPolarity({ label: 'Agent pool', note: 'Plays Jett on attack.', severity: 'info' })).toBe('neutral')
  })
})
