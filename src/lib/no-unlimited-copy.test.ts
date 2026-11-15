import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analysesLeftSidebarLabel, sharedAnalysesPoolHint } from './quota-display'

const root = join(__dirname, '..', '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(vue|ts)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : []
  })
}

// Owner rule: every paid plan has a numeric cap, so no user-facing copy may say "unlimited" (or ∞).
// Allowed: comments, identifiers (isUnlimitedQuota…), the API's `'unlimited'` enum value and the
// `usage.unlimited` admin flag. Admin accounts read "No cap (admin)".
describe('no user-facing "unlimited" copy', () => {
  it('src/ and electron/ never show "unlimited" or ∞', () => {
    const hits: string[] = []
    for (const dir of ['src', 'electron']) {
      for (const file of files(join(root, dir))) {
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (/^\s*(\/\/|\/?\*|<!--)/.test(line)) return
          const stripped = line
            .replace(/\/\/.*$|\/\*.*?\*\//g, '')
            .replace(/'unlimited'/g, '')
            .replace(/\.unlimited\b|\bunlimited\s*\??:/g, '')
            .replace(/\w*unlimited\w*/gi, (m) => (/^unlimited$/i.test(m) ? m : ''))
          if (/unlimited|∞/i.test(stripped)) hits.push(`${relative(root, file)}:${i + 1}`)
        })
      }
    }
    expect(hits).toEqual([])
  })

  it('admin-sized quotas say "No cap (admin)"', () => {
    expect(analysesLeftSidebarLabel(0, Number.MAX_SAFE_INTEGER)).toBe('No cap (admin)')
    expect(sharedAnalysesPoolHint(0, null)).toContain('No cap (admin)')
    expect(analysesLeftSidebarLabel(3, 10)).toBe('7 analyses left')
  })
})
