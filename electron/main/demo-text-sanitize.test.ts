import { describe, expect, it } from 'vitest'
import { sanitizeDemoClientName, sanitizeDemoMapName, isDemoLikelyIncomplete } from './demo-text-sanitize'

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

describe('isDemoLikelyIncomplete', () => {
  it('treats stable files as complete even when parse fails heuristics would apply to fresh writes', () => {
    const fs = require('fs') as typeof import('fs')
    const os = require('os') as typeof import('os')
    const path = require('path') as typeof import('path')
    const tmp = path.join(os.tmpdir(), `upforge-demo-${Date.now()}.dem`)
    fs.writeFileSync(tmp, Buffer.alloc(200 * 1024))
    const old = Date.now() - 15 * 60 * 1000
    fs.utimesSync(tmp, old / 1000, old / 1000)
    expect(isDemoLikelyIncomplete(tmp, { playbackTime: 900 })).toBe(false)
    fs.unlinkSync(tmp)
  })
})
