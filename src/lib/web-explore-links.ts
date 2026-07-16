/** Deep links from desktop → web progression features. */

export const WEB_BASE = 'https://upforge.gg'

export const WEB_EXPLORE_LINKS = [
  { label: 'Roadmap', path: '/improvement-roadmap', href: `${WEB_BASE}/improvement-roadmap`, hint: 'Prioritised improvement plan', embed: true },
  { label: 'Skill profile', path: '/skill-profile', href: `${WEB_BASE}/skill-profile`, hint: 'Category scores over time', embed: true },
  { label: 'Guides', path: '/guides', href: `${WEB_BASE}/guides`, hint: 'Drills and playbooks', embed: true },
  { label: 'Insights', path: '/insights', href: `${WEB_BASE}/insights`, hint: 'Map and pro insights', embed: false },
  { label: 'Dashboard', path: '/dashboard', href: `${WEB_BASE}/dashboard`, hint: 'Full web coaching hub', embed: true },
] as const

/** Priority order for post-analysis “next step” CTA. */
export const WEB_NEXT_STEPS = [
  { label: 'Open your roadmap', path: '/improvement-roadmap', href: `${WEB_BASE}/improvement-roadmap` },
  { label: 'View skill profile', path: '/skill-profile', href: `${WEB_BASE}/skill-profile` },
  { label: 'Browse guides', path: '/guides', href: `${WEB_BASE}/guides` },
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

/** Open a web feature in the authenticated shell when possible; else system browser. */
export async function openWebFeature(pathOrHref: string, embed = true): Promise<void> {
  const path = pathOrHref.startsWith('http')
    ? new URL(pathOrHref).pathname + new URL(pathOrHref).search
    : pathOrHref
  if (embed && window.api?.app?.openWebShell) {
    const res = await window.api.app.openWebShell(path)
    if (res.ok) return
  }
  const href = pathOrHref.startsWith('http')
    ? pathOrHref
    : `${WEB_BASE}${path.startsWith('/') ? path : `/${path}`}`
  await window.api.app.openUrl(href)
}
