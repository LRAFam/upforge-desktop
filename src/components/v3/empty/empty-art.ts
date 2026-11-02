/**
 * Picks the one dim backdrop an empty state shows (see EmptyArt.vue).
 * Order: an explicit art override → a Valorant map's stylized background → the game's own art.
 * A Valorant agent adds a full-portrait cut-out on top (it breaks the band's top edge).
 * Only hosts already in the CSP (media.valorant-api.com) or bundled assets.
 */
import valorantSplash from '../../../assets/hero-agents.webp'
import valorantAbstract from '../../../assets/games/valorant-card-bg.webp'
import cs2Art from '../../../assets/games/cs2-card-bg.webp'
import deadlockArt from '../../../assets/games/deadlock-card-bg.webp'
import lolArt from '../../../assets/games/lol-card-bg.webp'
import { getAgentImage, getMapImage } from '../../../lib/valorant'

export type EmptyArtGame = 'valorant' | 'cs2' | 'deadlock' | 'lol'

const GAME_ART: Record<EmptyArtGame, string> = {
  valorant: valorantSplash,
  cs2: cs2Art,
  deadlock: deadlockArt,
  lol: lolArt,
}

export function normalizeEmptyArtGame(game: string | null | undefined): EmptyArtGame {
  const g = (game ?? '').toLowerCase()
  if (g === 'cs2' || g === 'deadlock' || g === 'lol') return g
  if (g === 'league' || g === 'leagueoflegends' || g === 'league_of_legends') return 'lol'
  return 'valorant'
}

/** valorant-api's dark, moody map background (2560×1440, ~0.5 MB) — same map UUID as the splash. */
export function valorantMapBackdrop(map: string | null | undefined): string {
  const splash = getMapImage(map)
  return splash ? splash.replace('/splash.png', '/stylizedbackgroundimage.png') : ''
}

/** Full-height agent portrait (transparent PNG) — same agent UUID as the display icon. */
export function valorantAgentPortrait(agent: string | null | undefined): string {
  const icon = getAgentImage(agent)
  return icon ? icon.replace('/displayicon.png', '/fullportrait.png') : ''
}

export interface EmptyArtPick {
  backdrop: string
  agent: string | null
  kind: 'art' | 'map' | 'game'
}

export function pickEmptyArt(input: { game?: string | null; map?: string | null; agent?: string | null; art?: string | null }): EmptyArtPick {
  const game = normalizeEmptyArtGame(input.game)
  const agent = game === 'valorant' ? valorantAgentPortrait(input.agent) || null : null
  if (input.art) return { backdrop: input.art, agent, kind: 'art' }
  const map = game === 'valorant' ? valorantMapBackdrop(input.map) : ''
  if (map) return { backdrop: map, agent, kind: 'map' }
  // The Valorant splash already has five agents in it; under a single agent cut-out use the abstract art.
  const backdrop = game === 'valorant' && agent ? valorantAbstract : GAME_ART[game]
  return { backdrop, agent, kind: 'game' }
}
