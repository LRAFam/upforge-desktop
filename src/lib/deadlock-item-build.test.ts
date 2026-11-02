import { describe, expect, it } from 'vitest'
import { deadlockBandArt, deadlockBuildSummary, deadlockItemBuild, deadlockRowHeroArt, deadlockStepLabel } from './deadlock-item-build'
import { deadlockReportView } from './match-report-games'

const ART = 'https://assets-bucket.deadlock-api.com/assets-api-res/images/heroes'

describe('deadlockItemBuild', () => {
  const raw = [
    { item_id: 2, name: 'Extra Stamina', icon: `${ART}/i2.png`, slot: 'vitality', tier: 1, cost: 800, bought_at_sec: 245, sold_at_sec: null },
    { item_id: 1, name: 'Basic Magazine', icon: `${ART}/i1.png`, slot: 'weapon', tier: 1, cost: 800, bought_at_sec: 130, sold_at_sec: 1450 },
    { item_id: 3, name: null, icon: 'http://insecure/x.png', slot: 'bogus', tier: null, cost: null, bought_at_sec: 900, sold_at_sec: null },
    { item_id: 4, name: 'No time' },
  ]

  it('orders items by buy time, marks sells, and keeps only safe icons', () => {
    const steps = deadlockItemBuild(raw)!
    expect(steps.map(s => s.name)).toEqual(['Basic Magazine', 'Extra Stamina', 'Unknown item'])
    expect(steps[0]).toMatchObject({ at: '2:10', soldAt: '24:10', slot: 'weapon' })
    expect(steps[1]).toMatchObject({ at: '4:05', soldAt: null })
    expect(steps[2]).toMatchObject({ icon: null, slot: null })
    expect(deadlockBuildSummary(steps)).toBe('3 items bought · 1 sold')
    expect(deadlockStepLabel(steps[0])).toBe('Basic Magazine, weapon, bought at 2:10, sold at 24:10')
  })

  it('keeps "not published" (null) apart from "bought nothing" ([])', () => {
    expect(deadlockItemBuild(null)).toBeNull()
    expect(deadlockItemBuild([])).toEqual([])
  })
})

describe('Deadlock art', () => {
  it('uses the hero card in rows, else the small icon', () => {
    expect(deadlockRowHeroArt({ hero_card: `${ART}/card.png`, hero_icon: 'x.png' })).toEqual({ src: `${ART}/card.png`, kind: 'card' })
    expect(deadlockRowHeroArt({ hero_icon: `${ART}/icon.png` })).toEqual({ src: `${ART}/icon.png`, kind: 'icon' })
    expect(deadlockRowHeroArt({})).toBeNull()
  })

  it('band: card, then background, else null (caller falls back to game art)', () => {
    expect(deadlockBandArt({ card: `${ART}/card.png`, background: `${ART}/bg.webp` })).toBe(`${ART}/card.png`)
    expect(deadlockBandArt({ card: null, background: `${ART}/bg.webp` })).toBe(`${ART}/bg.webp`)
    expect(deadlockBandArt(null)).toBeNull()
  })
})

describe('deadlockReportView · art and build', () => {
  it('reads hero_art and item_build when the API sends them', () => {
    const v = deadlockReportView({
      match_id: '1', facts: { hero: 'Haze', won: true },
      hero_art: { hero_id: 13, name: 'Haze', card: `${ART}/haze_card.png` },
      item_build: [{ item_id: 1, name: 'Basic Magazine', icon: null, slot: 'weapon', tier: 1, cost: 800, bought_at_sec: 60, sold_at_sec: null }],
    })
    expect(v.bandArt).toBe(`${ART}/haze_card.png`)
    expect(v.itemBuild).toHaveLength(1)
  })

  it('older API (no fields): no band art and no item section', () => {
    const v = deadlockReportView({ match_id: '1', facts: { hero: 'Haze' } })
    expect(v.bandArt).toBeNull()
    expect(v.itemBuild).toBeUndefined()
    expect(deadlockReportView({ match_id: '1', item_build: null }).itemBuild).toBeNull()
  })
})
