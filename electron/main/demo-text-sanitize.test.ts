import { describe, expect, it } from 'vitest'
import { sanitizeDemoClientName, sanitizeDemoMapName } from './demo-text-sanitize'

describe('sanitizeDemoMapName', () => {
  it('accepts valid map ids', () => {
    expect(sanitizeDemoMapName('cs_office')).toBe('cs_office')
    expect(sanitizeDemoMapName('de_dust2')).toBe('de_dust2')
  })

  it('rejects binary garbage and uses fallback', () => {
    expect(sanitizeDemoMapName('(\u0275\u015dA\u06d9', 'cs_office')).toBe('cs_office')
    expect(sanitizeDemoMapName('???', null)).toBeNull()
  })
})

describe('sanitizeDemoClientName', () => {
  it('accepts normal steam names', () => {
    expect(sanitizeDemoClientName('CHEWI')).toBe('CHEWI')
  })

  it('rejects corrupted header bytes', () => {
    expect(sanitizeDemoClientName('(\u0275\u015dA\u06d9')).toBeNull()
  })
})
