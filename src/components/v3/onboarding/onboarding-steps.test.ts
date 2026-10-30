import { describe, expect, it } from 'vitest'
import { railSteps, stepNumber } from './onboarding-steps'

const labels = ['Sign in', 'Your game', 'Game account', 'Capture check', 'Your first match'] as const

describe('railSteps', () => {
  it('marks earlier steps done, the active one current and later ones todo', () => {
    expect(railSteps(labels, 3, false).map(s => s.state)).toEqual(['done', 'done', 'current', 'todo', 'todo'])
  })
  it('shows nothing as current while the wizard is still loading', () => {
    expect(railSteps(labels, 1, true).every(s => s.state === 'todo')).toBe(true)
  })
  it('keeps labels and 1-based numbers', () => {
    expect(railSteps(labels, 1, false)[4]).toEqual({ n: 5, label: 'Your first match', state: 'todo' })
  })
})

describe('stepNumber', () => {
  it('pads to two digits', () => {
    expect(stepNumber(4)).toBe('04')
  })
})
