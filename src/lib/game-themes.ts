import type { PrimaryGame } from './games'
import { PRIMARY_GAME_ARTWORK } from './games'

export interface GameTheme {
  id: PrimaryGame
  name: string
  shortName: string
  hexColor: string
  /** RGB components for rgba() in inline styles — e.g. "255,70,85" */
  rgb: string
  artwork: string
  accentText: string
  accentMuted: string
  accentBg: string
  accentBorder: string
  /** Active nav tab (RouterLink) */
  navActiveClass: string
  /** Title bar + nav accent gradient tailwind classes */
  chromeGradient: string
  coachingEmptyTitle: string
  coachingEmptyMessage: (ctx: { obsConnected: boolean }) => string
  coachingEmptyAction: (ctx: { obsConnected: boolean }) => string
  accountLinkLabel: string
  goalRankClass: string
  rankFallback: string
  historyFilterActiveClass: string
  historyRowActiveClass: string
}

export const GAME_THEMES: Record<PrimaryGame, GameTheme> = {
  valorant: {
    id: 'valorant',
    name: 'VALORANT',
    shortName: 'Valorant',
    hexColor: '#ff4655',
    rgb: '255,70,85',
    artwork: PRIMARY_GAME_ARTWORK.valorant,
    accentText: 'text-red-400',
    accentMuted: 'text-red-400/60',
    accentBg: 'bg-red-500/10',
    accentBorder: 'border-red-500/20',
    navActiveClass: 'text-white bg-red-500/[0.10] shadow-[inset_0_0_0_1px_rgba(255,70,85,0.22)]',
    chromeGradient: 'from-transparent via-red-500/70 to-orange-500/70',
    coachingEmptyTitle: 'No coaching data yet',
    coachingEmptyMessage: ({ obsConnected }) =>
      obsConnected
        ? 'Queue a Valorant match — your next game will be recorded and coached'
        : 'Connect OBS in Settings, then queue a match — UpForge records automatically',
    coachingEmptyAction: ({ obsConnected }) => (obsConnected ? 'Ready to play' : 'Connect OBS'),
    accountLinkLabel: 'Link Riot ID →',
    goalRankClass: 'text-red-300',
    rankFallback: 'Unranked',
    historyFilterActiveClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    historyRowActiveClass: 'border-red-500/35 bg-red-500/[0.08] shadow-[0_0_0_1px_rgba(239,68,68,0.12)]',
  },
  cs2: {
    id: 'cs2',
    name: 'CS2',
    shortName: 'CS2',
    hexColor: '#f97316',
    rgb: '249,115,22',
    artwork: PRIMARY_GAME_ARTWORK.cs2,
    accentText: 'text-orange-400',
    accentMuted: 'text-orange-400/60',
    accentBg: 'bg-orange-500/10',
    accentBorder: 'border-orange-500/20',
    navActiveClass: 'text-white bg-orange-500/[0.10] shadow-[inset_0_0_0_1px_rgba(249,115,22,0.22)]',
    chromeGradient: 'from-transparent via-orange-500/70 to-amber-500/60',
    coachingEmptyTitle: 'Upload a demo for AI coaching',
    coachingEmptyMessage: () => 'Analyse a .dem on the web or let UpForge auto-upload after matches',
    coachingEmptyAction: () => 'Analyze →',
    accountLinkLabel: 'FACEIT username',
    goalRankClass: 'text-orange-300',
    rankFallback: 'CS2',
    historyFilterActiveClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    historyRowActiveClass: 'border-orange-500/35 bg-orange-500/[0.08] shadow-[0_0_0_1px_rgba(249,115,22,0.12)]',
  },
  deadlock: {
    id: 'deadlock',
    name: 'Deadlock',
    shortName: 'Deadlock',
    hexColor: '#14b8a6',
    rgb: '20,184,166',
    artwork: PRIMARY_GAME_ARTWORK.deadlock,
    accentText: 'text-teal-400',
    accentMuted: 'text-teal-400/60',
    accentBg: 'bg-teal-500/10',
    accentBorder: 'border-teal-500/20',
    navActiveClass: 'text-white bg-teal-500/[0.10] shadow-[inset_0_0_0_1px_rgba(20,184,166,0.22)]',
    chromeGradient: 'from-transparent via-teal-500/70 to-cyan-500/60',
    coachingEmptyTitle: 'Upload a replay for AI coaching',
    coachingEmptyMessage: () =>
      'Replays auto-upload after matches — or analyze any .dem from the Replays panel',
    coachingEmptyAction: () => 'Analyze →',
    accountLinkLabel: 'Link Steam by display name',
    goalRankClass: 'text-teal-300',
    rankFallback: 'Deadlock',
    historyFilterActiveClass: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    historyRowActiveClass: 'border-teal-500/35 bg-teal-500/[0.08] shadow-[0_0_0_1px_rgba(20,184,166,0.12)]',
  },
}

export function gameTheme(game: PrimaryGame): GameTheme {
  return GAME_THEMES[game] ?? GAME_THEMES.valorant
}

/** CSS custom properties for shell chrome — bind on App root. */
export function gameThemeCssVars(theme: GameTheme): Record<string, string> {
  return {
    '--game-accent': theme.hexColor,
    '--game-accent-rgb': theme.rgb,
  }
}
