import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { roveStop, roveTarget, type RoveItem } from './roving-focus'

// Round 1: [num, what, preview, preview]; round 2 open: [num, what, event, event]; round 3: [num, what]
const items: RoveItem[] = [
  { line: false, group: '0' }, { line: true, group: '0' }, { line: false, group: '0' }, { line: false, group: '0' },
  { line: false, group: '1' }, { line: true, group: '1' }, { line: true, group: '1' }, { line: true, group: '1' },
  { line: false, group: '2' }, { line: true, group: '2' },
]

describe('roveTarget', () => {
  it('moves between rounds and open events with up / down', () => {
    expect(roveTarget(items, 1, 'ArrowDown')).toBe(5)
    expect(roveTarget(items, 5, 'ArrowDown')).toBe(6)
    expect(roveTarget(items, 7, 'ArrowDown')).toBe(9)
    expect(roveTarget(items, 9, 'ArrowUp')).toBe(7)
    expect(roveTarget(items, 0, 'ArrowDown')).toBe(1)
  })
  it('moves along one round with left / right and stops at its ends', () => {
    expect(roveTarget(items, 1, 'ArrowRight')).toBe(2)
    expect(roveTarget(items, 1, 'ArrowLeft')).toBe(0)
    expect(roveTarget(items, 3, 'ArrowRight')).toBeNull()
    expect(roveTarget(items, 0, 'ArrowLeft')).toBeNull()
  })
  it('jumps to the first and last row', () => {
    expect(roveTarget(items, 6, 'Home')).toBe(1)
    expect(roveTarget(items, 2, 'End')).toBe(9)
  })
  it('ignores other keys and bad input', () => {
    expect(roveTarget(items, 1, 'Enter')).toBeNull()
    expect(roveTarget([], 0, 'ArrowDown')).toBeNull()
    expect(roveTarget(items, 99, 'ArrowDown')).toBeNull()
  })
})

describe('roveStop', () => {
  it('prefers the last focused item, then the round being watched, then the first row', () => {
    expect(roveStop(10, { last: 6, current: 5, firstLine: 1 })).toBe(6)
    expect(roveStop(10, { last: -1, current: 5, firstLine: 1 })).toBe(5)
    expect(roveStop(10, { last: -1, current: -1, firstLine: 1 })).toBe(1)
    expect(roveStop(0, {})).toBe(-1)
  })
})

describe('match review keyboard markup', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8')
  const roundLog = read('../components/vod-review/VodRoundLogSidebar.vue')
  const timeline = read('../components/vod-review/VodMatchTimelineSidebar.vue')
  const body = read('../components/vod-review/VodReviewBody.vue')
  const page = read('../views/v3/MatchPageV3.vue')
  it('makes the round log and the match timeline one Tab stop each', () => {
    expect(roundLog).toMatch(/useRovingFocus\(roveRoot\)/)
    expect(roundLog).toMatch(/data-rove="line"/)
    expect(roundLog).toMatch(/data-rove-current/)
    expect(timeline).toMatch(/useRovingFocus\(roveRoot\)/)
  })
  it('keeps timeline markers out of the Tab order', () => {
    const transport = body.slice(body.indexOf('<div class="vb3-transport">'), body.indexOf('<div class="vb3-controls">'))
    const buttons = transport.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b).toContain('tabindex="-1"')
  })
  it('has skip links to the video, round log and notes', () => {
    expect(page).toMatch(/Skip to video/)
    expect(page).toMatch(/Skip to round log/)
    expect(page).toMatch(/Skip to notes/)
  })
})
