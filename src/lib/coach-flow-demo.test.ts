import { describe, expect, it } from 'vitest'
import { applyFlowEvent, clock, emptyFlow, noteLines, seconds, usd } from './coach-flow-demo'

describe('applyFlowEvent', () => {
  it('keeps one row per step and adds up done costs', () => {
    let s = emptyFlow()
    s = applyFlowEvent(s, { step: 'report', label: 'Match report ready', state: 'running', at: 1200 })
    s = applyFlowEvent(s, { step: 'report', label: 'Match report ready', state: 'done', at: 5200, took: 4000, costUsd: 0.002, payload: { notes: { headline: { text: 'H' } } } })
    s = applyFlowEvent(s, { step: 'moment-1', label: 'Key moment 1', state: 'done', at: 9000, took: 3000, costUsd: 0.02, payload: { round_number: 7, why: 'w', story: 's', fixes: [] } })
    expect(s.steps).toHaveLength(2)
    expect(s.steps[0].at).toBe(1200)
    expect(s.steps[0].took).toBe(4000)
    expect(s.costUsd).toBeCloseTo(0.022)
    expect(s.notes).toEqual({ headline: { text: 'H' } })
    expect(s.moments[0].round_number).toBe(7)
  })

  it('marks the run idle without adding a timeline row', () => {
    const s = applyFlowEvent(emptyFlow(), { step: '__idle', label: '', state: 'done', at: 30000 })
    expect(s.idle).toBe(true)
    expect(s.steps).toHaveLength(0)
    expect(s.lastAt).toBe(30000)
  })
})

describe('formatting', () => {
  it('shows seconds, cost and clock times', () => {
    expect(seconds(12400)).toBe('12.4 s')
    expect(usd(0.046)).toBe('$0.046')
    expect(usd(0.0019)).toBe('$0.0019')
    expect(usd(0)).toBe('')
    expect(clock(102000)).toBe('1:42')
  })

  it('reads note lines from the report payload', () => {
    const n = noteLines({ headline: { text: 'You died first 6 times.' }, subline: { text: 'Two in the first 10 s.' }, evidence: [{ text: 'Rounds 2, 5.' }], next_action: { text: 'Hold with a teammate.' } })
    expect(n.headline).toBe('You died first 6 times.')
    expect(n.lines).toEqual(['Two in the first 10 s.', 'Rounds 2, 5.'])
    expect(n.next).toBe('Hold with a teammate.')
  })
})
