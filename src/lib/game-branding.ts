/**
 * Official game branding assets (bundled locally — no runtime CDN dependency).
 *
 * Sources:
 * - Valorant V mark: Riot Games via Wikimedia Commons → exported PNG
 * - CS2: Counter-Strike emblem from game files (Juknum/counter-strike-icons, csgologo.svg)
 * - Deadlock: Valve Steam store logo (app 1422450)
 * - League of Legends: official Riot Games "L" logomark (full-colour hextech mark)
 */
import valorantLogo from '../assets/games/valorant-logo.png'
import cs2Logo from '../assets/games/cs2-icon.png'
import deadlockLogo from '../assets/games/deadlock-icon.png'
import lolLogo from '../assets/games/lol-icon.webp'
import type { PrimaryGame } from './games'

export interface GameBrand {
  /** Small square icon (tabs, activity feed, card header). */
  logo: string
  wordmark: string
  rankLabel: string
  valveRankLabel?: string
  faceitRankLabel?: string
  accent: string
  accentMuted: string
  accentRgb: string
  ctaSolid: boolean
  ctaLabel: string
  ctaIcon: 'target' | 'upload' | 'play'
}

export const GAME_BRAND: Record<PrimaryGame, GameBrand> = {
  valorant: {
    logo: valorantLogo,
    wordmark: 'VALORANT',
    rankLabel: 'Competitive Rank',
    accent: '#ff4655',
    accentMuted: '#ff465588',
    accentRgb: '255, 70, 85',
    ctaSolid: true,
    ctaLabel: 'Run aim drill',
    ctaIcon: 'target',
  },
  cs2: {
    logo: cs2Logo,
    wordmark: 'CS2',
    rankLabel: 'CS2 Stats',
    valveRankLabel: 'Steam / MM',
    faceitRankLabel: 'FACEIT Level',
    accent: '#3b82f6',
    accentMuted: '#3b82f688',
    accentRgb: '59, 130, 246',
    ctaSolid: false,
    ctaLabel: 'Upload demo',
    ctaIcon: 'upload',
  },
  deadlock: {
    logo: deadlockLogo,
    wordmark: 'DEADLOCK',
    rankLabel: 'Rank',
    accent: '#eab308',
    accentMuted: '#eab30888',
    accentRgb: '234, 179, 8',
    ctaSolid: false,
    ctaLabel: 'Review replay',
    ctaIcon: 'play',
  },
  lol: {
    logo: lolLogo,
    wordmark: 'LEAGUE',
    rankLabel: 'Ranked Solo/Duo',
    accent: '#c89b3c',
    accentMuted: '#c89b3c88',
    accentRgb: '200, 155, 60',
    ctaSolid: false,
    ctaLabel: 'Analyze match',
    ctaIcon: 'play',
  },
}

export function gameBrand(game: PrimaryGame): GameBrand {
  return GAME_BRAND[game]
}
