/**
 * Measures text and focus-ring contrast for the v3 tokens in v3.css (WCAG 2.2 relative luminance).
 * Small text needs 4.5:1, focus rings and non-text marks 3:1, on every surface it can sit on.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'v3.css'), 'utf8')
function token(name: string): string {
  const m = css.match(new RegExp(`--uf-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --uf-${name} not found`)
  return m[1]
}
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const SURFACES = ['chrome', 'bg', 'raised', 'hover']
const TEXT = ['bone', 'muted', 'faint', 'red', 'win', 'loss', 'gold']

describe('v3 colour contrast', () => {
  for (const text of TEXT) {
    for (const surface of SURFACES) {
      it(`--uf-${text} text on --uf-${surface} is at least 4.5:1`, () => {
        expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
  for (const surface of SURFACES) {
    it(`focus ring (--uf-red) on --uf-${surface} is at least 3:1`, () => {
      expect(contrast(token('red'), token(surface))).toBeGreaterThanOrEqual(3)
    })
  }
  it('faint text stays visibly quieter than muted text', () => {
    expect(contrast(token('muted'), token('faint'))).toBeGreaterThan(1.2)
  })
})
