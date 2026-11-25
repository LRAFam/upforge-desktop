import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initialSummaryOpen, saveSummaryOpen, SUMMARY_OPEN_KEY, summaryContents } from './match-summary-panel'

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v } }
}

describe('match summary panel state', () => {
  it('starts closed so the replay gets the height', () => {
    expect(initialSummaryOpen(memory())).toBe(false)
    expect(initialSummaryOpen(null)).toBe(false)
  })
  it('remembers the viewer’s choice', () => {
    const s = memory()
    saveSummaryOpen(s, true)
    expect(s.data[SUMMARY_OPEN_KEY]).toBe('1')
    expect(initialSummaryOpen(s)).toBe(true)
    saveSummaryOpen(s, false)
    expect(initialSummaryOpen(s)).toBe(false)
  })
  it('opens for a post-game "Review round N" link, whatever was saved', () => {
    expect(initialSummaryOpen(memory({ [SUMMARY_OPEN_KEY]: '0' }), { autoReview: true })).toBe(true)
  })
  it('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(initialSummaryOpen(blocked)).toBe(false)
    expect(() => saveSummaryOpen(blocked, true)).not.toThrow()
  })
})

describe('summaryContents', () => {
  it('lists what rendered, in order, without repeats', () => {
    expect(summaryContents(['rounds', 'match stats', undefined, 'enemy habits', 'rounds'])).toBe('Rounds, match stats and enemy habits')
    expect(summaryContents(['AI round review'])).toBe('AI round review')
    expect(summaryContents(['rounds', '2D replay'])).toBe('Rounds and 2D replay')
  })
  it('is empty when nothing rendered (the toggle then hides)', () => {
    expect(summaryContents([])).toBe('')
    expect(summaryContents([undefined, null, ' '])).toBe('')
  })
})

describe('match page layout', () => {
  const page = readFileSync(resolve(__dirname, '../../../views/v3/MatchPageV3.vue'), 'utf8')
  const header = readFileSync(resolve(__dirname, './MatchPageHeaderV3.vue'), 'utf8')
  it('keeps the summaries in the collapsible section, above the player', () => {
    const summary = page.indexOf('class="uf-mp-summary"')
    const body = page.indexOf('<VodReviewBody')
    expect(summary).toBeGreaterThan(-1)
    for (const part of ['<MatchRoundsStripV3', '<MatchStatsDrawerV3', '<EnemyHabitsV3', '<RoundReviewV3', '<ReplayViewerV3']) {
      const at = page.indexOf(part)
      expect(at, part).toBeGreaterThan(summary)
      expect(at, part).toBeLessThan(body)
    }
    expect(page).toMatch(/v-show="summaryOpen"/)
  })
  it('uses a compact hero and no rounds strip in the header', () => {
    expect(header).toMatch(/:height="112"/)
    expect(header).not.toMatch(/UfRoundsLine/)
  })
})
