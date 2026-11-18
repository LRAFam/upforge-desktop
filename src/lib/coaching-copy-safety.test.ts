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
  const BLOCKED = [
    /costing you (most |the most )?(rounds|games)/i, /keeps costing/i, /still costing/i, /did it carry over/i, /carried over/i, /fastest path to climbing/i, /improved because of/i,
    // Trainer result screen: trainer scores do not show match impact, and no data shows causes like these.
    /translating\b.{0,60}\binto\b/i, /match impact/i, /cold muscles/i, /amplif(y|ies) inconsistency/i, /lock this in/i,
  ]
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

// The trainer result screen used canned if/else coaching: it could praise a C run ("Strong performance
// across all metrics") and gave advice the app cannot act on. It now shows measured facts only.
describe('trainer result screen copy', () => {
  const ADVICE = [/strong performance/i, /excellent accuracy/i, /consider increasing/i, /warm up for/i, /suggests? (rushed|mechanical)/i, /deliberate repetition/i, /stay on a daily cadence/i, /push your ceiling/i, /dial back/i]
  it('the result screen and its summary contain no canned advice or praise', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const root = join(__dirname, '..', '..')
    const hits: string[] = []
    for (const file of ['src/views/TrainerResultsView.vue', 'src/lib/trainer-run-summary.ts']) {
      readFileSync(join(root, file), 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\/?\*)/.test(line)) return
        if (ADVICE.some(re => re.test(line))) hits.push(`${file}:${i + 1}`)
      })
    }
    expect(hits).toEqual([])
  })
})
