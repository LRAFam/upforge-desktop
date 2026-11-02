import { describe, expect, it } from 'vitest'
import { nextSkipped, railSteps, stepNumber } from './onboarding-steps'

const labels = ['Sign in', 'Your game', 'Game account', 'Capture check', 'Your first match'] as const

describe('railSteps', () => {
  it('marks earlier steps done, the active one current and later ones todo', () => {
    expect(railSteps(labels, 3, false).map(s => s.state)).toEqual(['done', 'done', 'current', 'todo', 'todo'])
  })
  it('shows nothing as current while the wizard is still loading', () => {
    expect(railSteps(labels, 1, true).every(s => s.state === 'todo')).toBe(true)
  })
  it('keeps labels and 1-based numbers', () => {
    expect(railSteps(labels, 1, false)[4]).toEqual({ n: 5, pos: 5, label: 'Your first match', state: 'todo' })
  })
  it('counts only the steps shown when some were skipped (01/05 → 04/05 becomes 02/03)', () => {
    const steps = railSteps(labels, 4, false, [2, 3])
    expect(steps.map(s => s.label)).toEqual(['Sign in', 'Capture check', 'Your first match'])
    const current = steps.find(s => s.state === 'current')!
    expect(`${stepNumber(current.pos)} / ${stepNumber(steps.length)}`).toBe('02 / 03')
  })
  it('always shows the current step even if it was marked skipped', () => {
    expect(railSteps(labels, 2, false, [2, 3]).map(s => s.n)).toEqual([1, 2, 4, 5])
  })
})

describe('nextSkipped', () => {
  it('records the steps a forward jump passes over', () => {
    expect(nextSkipped([], 1, 4)).toEqual([2, 3])
  })
  it('adds nothing for a normal next step', () => {
    expect(nextSkipped([], 1, 2)).toEqual([])
  })
  it('shows a skipped step again when the player goes back to it', () => {
    expect(nextSkipped([2, 3], 4, 2)).toEqual([3])
  })
  it('keeps earlier skips on later moves', () => {
    expect(nextSkipped([3], 2, 4)).toEqual([3])
  })
})

describe('stepNumber', () => {
  it('pads to two digits', () => {
    expect(stepNumber(4)).toBe('04')
  })
})
