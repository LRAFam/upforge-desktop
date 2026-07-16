/** Deep links from desktop → web progression features. */

export const WEB_BASE = 'https://upforge.gg'

export type WebExploreLink = {
  label: string
  path: string
  href: string
  hint: string
  /** Open in authenticated in-app shell when possible */
  embed: boolean
  /** Show in left sidebar “On the web” section */
  sidebar: boolean
}

/**
 * Web-primary surfaces desktop users miss.
 * Keep aligned with frontend SectionTabNav progress/training/library groups.
 */
export const WEB_EXPLORE_LINKS: readonly WebExploreLink[] = [
  { label: 'Roadmap', path: '/improvement-roadmap', href: `${WEB_BASE}/improvement-roadmap`, hint: 'Prioritised improvement plan', embed: true, sidebar: true },
  { label: 'Skill profile', path: '/skill-profile', href: `${WEB_BASE}/skill-profile`, hint: 'Category scores over time', embed: true, sidebar: true },
  { label: 'Playstyle', path: '/valorant/playstyle', href: `${WEB_BASE}/valorant/playstyle`, hint: 'How you play — role and tendencies', embed: true, sidebar: false },
  { label: 'Weekly goals', path: '/weekly-goals', href: `${WEB_BASE}/weekly-goals`, hint: 'This week’s coaching targets', embed: true, sidebar: true },
  { label: 'Progress', path: '/progress', href: `${WEB_BASE}/progress`, hint: 'Reports and improvement history', embed: true, sidebar: false },
  { label: 'Trends', path: '/performance-trends', href: `${WEB_BASE}/performance-trends`, hint: 'Score and rank trends over time', embed: true, sidebar: false },
  { label: 'Map insights', path: '/map-insights', href: `${WEB_BASE}/map-insights`, hint: 'Where you win and lose rounds', embed: true, sidebar: false },
  { label: 'Guides', path: '/guides', href: `${WEB_BASE}/guides`, hint: 'Drills and coaching articles', embed: true, sidebar: true },
  { label: 'Playbooks', path: '/playbooks', href: `${WEB_BASE}/playbooks`, hint: 'Agent and map playbooks', embed: true, sidebar: false },
  { label: 'Lineups', path: '/lineups', href: `${WEB_BASE}/lineups`, hint: 'Ability lineups by map', embed: true, sidebar: false },
  { label: 'My guides', path: '/my-guides', href: `${WEB_BASE}/my-guides`, hint: 'Guides you saved or made', embed: true, sidebar: false },
  { label: 'My playbooks', path: '/my-playbooks', href: `${WEB_BASE}/my-playbooks`, hint: 'Your saved playbooks', embed: true, sidebar: false },
  { label: 'Insights', path: '/insights', href: `${WEB_BASE}/insights`, hint: 'Pro and match insights hub', embed: true, sidebar: false },
  { label: 'Rank challenge', path: '/rank-up-challenge', href: `${WEB_BASE}/rank-up-challenge`, hint: 'Focused rank-up coaching block', embed: true, sidebar: false },
  { label: 'Mental', path: '/mental-performance', href: `${WEB_BASE}/mental-performance`, hint: 'Tilt, focus, and routines', embed: true, sidebar: false },
  { label: 'Pregame brief', path: '/valorant/pregame-brief', href: `${WEB_BASE}/valorant/pregame-brief`, hint: 'Warm-up brief before ranked', embed: true, sidebar: false },
  { label: 'Player brain', path: '/brain', href: `${WEB_BASE}/brain`, hint: 'Your coaching knowledge hub', embed: true, sidebar: false },
  { label: 'Coaches', path: '/coaches', href: `${WEB_BASE}/coaches`, hint: 'Book a human coach', embed: true, sidebar: false },
  { label: 'Leaderboard', path: '/leaderboard', href: `${WEB_BASE}/leaderboard`, hint: 'Community rankings', embed: true, sidebar: false },
  { label: 'Highlights', path: '/highlights', href: `${WEB_BASE}/highlights`, hint: 'Weekly highlight reels', embed: true, sidebar: false },
  { label: 'Dashboard', path: '/dashboard', href: `${WEB_BASE}/dashboard`, hint: 'Full web coaching hub', embed: true, sidebar: false },
] as const

export const WEB_SIDEBAR_LINKS = WEB_EXPLORE_LINKS.filter(l => l.sidebar)

/** Priority order for post-analysis “next step” CTA. */
export const WEB_NEXT_STEPS = [
  { label: 'Open your roadmap', path: '/improvement-roadmap', href: `${WEB_BASE}/improvement-roadmap` },
  { label: 'Check weekly goals', path: '/weekly-goals', href: `${WEB_BASE}/weekly-goals` },
  { label: 'View skill profile', path: '/skill-profile', href: `${WEB_BASE}/skill-profile` },
  { label: 'Review progress', path: '/progress', href: `${WEB_BASE}/progress` },
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
