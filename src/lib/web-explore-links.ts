/** Deep links from desktop → web progression features. */

export const WEB_BASE = 'https://upforge.gg'

export const WEB_EXPLORE_LINKS = [
  { label: 'Roadmap', href: `${WEB_BASE}/improvement-roadmap`, hint: 'Prioritised improvement plan' },
  { label: 'Skill profile', href: `${WEB_BASE}/skill-profile`, hint: 'Category scores over time' },
  { label: 'Guides', href: `${WEB_BASE}/guides`, hint: 'Drills and playbooks' },
  { label: 'Insights', href: `${WEB_BASE}/insights`, hint: 'Map and pro insights' },
  { label: 'Dashboard', href: `${WEB_BASE}/dashboard`, hint: 'Full web coaching hub' },
] as const

/** Priority order for post-analysis “next step” CTA. */
export const WEB_NEXT_STEPS = [
  { label: 'Open your roadmap', href: `${WEB_BASE}/improvement-roadmap` },
  { label: 'View skill profile', href: `${WEB_BASE}/skill-profile` },
  { label: 'Browse guides', href: `${WEB_BASE}/guides` },
] as const

export function pickWebNextStep(seed?: number | string | null): (typeof WEB_NEXT_STEPS)[number] {
  const n = typeof seed === 'number' ? seed : String(seed ?? '').length
  return WEB_NEXT_STEPS[Math.abs(n) % WEB_NEXT_STEPS.length]!
}

export function tierDisplayLabel(tier: string | null | undefined): string {
  switch ((tier ?? 'free').toLowerCase()) {
    case 'premium':
      return 'Plus'
    case 'pro':
      return 'Pro'
    case 'founder':
      return 'Founder'
    case 'admin':
      return 'Admin'
    default:
      return 'Free'
  }
}

export function isPaidTier(tier: string | null | undefined): boolean {
  const t = (tier ?? 'free').toLowerCase()
  return t === 'premium' || t === 'pro' || t === 'founder' || t === 'admin'
}
