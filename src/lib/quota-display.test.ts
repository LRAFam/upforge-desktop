import { describe, expect, it } from 'vitest'
import {
  analysesLeftSidebarLabel,
  analysesLeftSidebarTone,
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

  it('admin-sized limits say "No cap (admin)", never "Unlimited"', () => {
    expect(analysesLeftSidebarLabel(0, 2_000_000)).toBe('No cap (admin)')
    expect(sharedAnalysesPoolHint(0, Number.MAX_SAFE_INTEGER)).toBe('No cap (admin) · shared across all games')
  })

  it('explicit null (admin only on the API) also reads "No cap (admin)"', () => {
    expect(analysesLeftSidebarLabel(2, null)).toBe('No cap (admin)')
  })

  it('sidebar tone escalates near and at limit', () => {
    expect(analysesLeftSidebarTone(2, 15)).toBe('ok')
    expect(analysesLeftSidebarTone(13, 15)).toBe('low')
    expect(analysesLeftSidebarTone(15, 15)).toBe('empty')
    expect(analysesLeftSidebarTone(0, null)).toBe('unlimited')
  })
})

// An omitted usage payload is not an unlimited entitlement or a fresh allowance.
describe('missing quota data', () => {
  it('does not advertise unlimited access while a profile is unavailable', () => {
    expect(analysesLeftSidebarLabel(undefined, undefined)).toBe('Usage unavailable')
    expect(analysesLeftSidebarTone(undefined, undefined)).toBe('unknown')
    expect(sharedAnalysesPoolHint(undefined, undefined)).toBe('Coaching usage unavailable')
  })
  it('does not assume zero consumption when the limit alone is known', () => {
    expect(analysesLeftSidebarLabel(undefined, 5)).toBe('Usage unavailable')
    expect(analysesLeftSidebarTone(undefined, 5)).toBe('unknown')
    expect(sharedAnalysesPoolHint(undefined, 5)).toBe('Coaching usage unavailable')
  })
  it('keeps a confirmed zero allowance exhausted', () => {
    expect(analysesLeftSidebarLabel(0, 0)).toBe('0 analyses left')
    expect(analysesLeftSidebarTone(0, 0)).toBe('empty')
  })
})
