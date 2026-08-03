import { describe, expect, it } from 'vitest'
import {
  analysesLeftSidebarLabel,
  analysesUsedLabel,
  sharedAnalysesPoolHint,
} from './quota-display'

describe('quota-display', () => {
  it('formats used of limit with left', () => {
    expect(analysesUsedLabel(2, 15)).toBe('2 of 15 used · 13 left')
  })

  it('shared pool hint still shows remaining', () => {
    expect(sharedAnalysesPoolHint(2, 15)).toContain('13 analyses left')
  })

  it('sidebar label shows N left', () => {
    expect(analysesLeftSidebarLabel(2, 15)).toBe('13 analyses left')
    expect(analysesLeftSidebarLabel(14, 15)).toBe('1 analysis left')
  })

  it('sidebar label unlimited', () => {
    expect(analysesLeftSidebarLabel(0, 2_000_000)).toBe('Unlimited analyses')
  })

  it('sidebar label unknown when limit missing', () => {
    expect(analysesLeftSidebarLabel(2, null)).toBe('Analyses')
  })
})
