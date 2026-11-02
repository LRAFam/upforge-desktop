/**
 * Deadlock hero art and the free match report's item build (API 2 Nov 2026+: `hero_card`,
 * `hero_portrait`, report `hero_art` and `item_build`). Every reader returns null when the API
 * didn't send the field, so older builds keep the plain report and the small hero icon.
 */
import { getDeadlockHeroIconUrl } from './deadlock'

const https = (v: unknown): string | null => (typeof v === 'string' && /^https:\/\/\S+$/i.test(v.trim()) ? v.trim() : null)
const int = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Row art for a recent match / hero stat: the hero card (shows the hero), else the small icon. */
export function deadlockRowHeroArt(row: { hero_card?: string | null; hero_portrait?: string | null; hero_icon?: string | null } | null | undefined): { src: string; kind: 'card' | 'icon' } | null {
  const card = https(row?.hero_card) ?? https(row?.hero_portrait)
  if (card) return { src: card, kind: 'card' }
  const icon = getDeadlockHeroIconUrl(row?.hero_icon ?? null)
  return icon ? { src: icon, kind: 'icon' } : null
}

export interface DeadlockHeroArt { hero_id?: number; name?: string | null; icon?: string | null; card?: string | null; portrait?: string | null; background?: string | null }

/** The report band's one big image: hero card, then the hero's background, else null (caller uses game art). */
export function deadlockBandArt(art: DeadlockHeroArt | null | undefined): string | null {
  return https(art?.card) ?? https(art?.background) ?? https(art?.portrait)
}

export type DeadlockItemSlot = 'weapon' | 'vitality' | 'spirit'

export interface DeadlockBuildStep {
  key: string
  name: string
  icon: string | null
  slot: DeadlockItemSlot | null
  tier: number | null
  cost: number | null
  atSec: number
  /** "7:05" */
  at: string
  /** "24:10" when the item was sold later; null when it was kept. */
  soldAt: string | null
}

export function clockTime(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const SLOTS: readonly string[] = ['weapon', 'vitality', 'spirit']

/**
 * Report `item_build` → buy-order steps. `null` from the API (no item list in the metadata) stays null,
 * so the page can say the build wasn't published instead of "bought nothing".
 */
export function deadlockItemBuild(raw: unknown): DeadlockBuildStep[] | null {
  if (!Array.isArray(raw)) return null
  const steps: DeadlockBuildStep[] = []
  raw.forEach((r, i) => {
    const it = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>
    if (!int(it.bought_at_sec)) return
    const slot = typeof it.slot === 'string' && SLOTS.includes(it.slot) ? it.slot as DeadlockItemSlot : null
    const sold = int(it.sold_at_sec) && it.sold_at_sec >= it.bought_at_sec ? it.sold_at_sec : null
    steps.push({
      key: `${i}-${int(it.item_id) ? it.item_id : 'x'}`,
      name: typeof it.name === 'string' && it.name.trim() ? it.name.trim() : 'Unknown item',
      icon: https(it.icon),
      slot,
      tier: int(it.tier) ? it.tier : null,
      cost: int(it.cost) ? it.cost : null,
      atSec: it.bought_at_sec,
      at: clockTime(it.bought_at_sec),
      soldAt: sold == null ? null : clockTime(sold),
    })
  })
  return steps.sort((a, b) => a.atSec - b.atSec)
}

/** "14 items bought · 3 sold" */
export function deadlockBuildSummary(steps: readonly DeadlockBuildStep[]): string {
  const sold = steps.filter(s => s.soldAt).length
  const bought = `${steps.length} ${steps.length === 1 ? 'item' : 'items'} bought`
  return sold ? `${bought} · ${sold} sold` : bought
}

/** Accessible label for one step: "Basic Magazine, weapon, bought at 2:10, sold at 18:00". */
export function deadlockStepLabel(s: DeadlockBuildStep): string {
  return [s.name, s.slot, `bought at ${s.at}`, s.soldAt ? `sold at ${s.soldAt}` : null].filter(Boolean).join(', ')
}
