import { describe, expect, it } from 'vitest'
import { sanitizeUnsupportedRankClaimsForDisplay } from './coaching-copy-safety'

describe('coaching copy safety', () => {
  it('removes unsupported skill-rank and causal rank claims from stored reports', () => {
    const text = 'Aim is Diamond-level (35% HS%), but 9 deaths are keeping you in Plat 1.'
    const safe = sanitizeUnsupportedRankClaimsForDisplay(text) ?? ''

    expect(safe).not.toContain('Diamond-level')
    expect(safe).not.toContain('keeping you in')
    expect(safe).toContain('35% HS%')
    expect(safe).toContain('this match')
  })
})

// #595: the desktop shows what was measured, not what it caused. These phrases claim a cause
// (or a carry-over) the data cannot support and must not come back in user-facing copy.
describe('no causal improvement copy in the app', () => {
  const BLOCKED = [/costing you (most |the most )?(rounds|games)/i, /keeps costing/i, /still costing/i, /did it carry over/i, /carried over/i, /fastest path to climbing/i, /improved because of/i]
  it('src/ and electron/ contain none of the blocked phrases', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const { join, relative } = await import('node:path')
    const root = join(__dirname, '..', '..')
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      return statSync(p).isDirectory() ? walk(p) : /\.(vue|ts)$/.test(name) && !/\.test\.ts$/.test(name) ? [p] : []
    })
    const hits: string[] = []
    for (const file of [...walk(join(root, 'src')), ...walk(join(root, 'electron'))]) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\/?\*)/.test(line)) return
        if (BLOCKED.some(re => re.test(line))) hits.push(`${relative(root, file)}:${i + 1}`)
      })
    }
    expect(hits).toEqual([])
  })
})
