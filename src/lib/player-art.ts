/**
 * Avatar art for a player row (Squad members, Coaches roster members): the Valorant player
 * card, else the main agent's portrait. Returns null when neither exists — the caller then
 * falls back to the name's first letter.
 */
import { getAgentImage, getRankIconUrl } from './valorant'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Square player-card art (same URL the title bar and dashboard use). */
export function playerCardSmallArt(cardId: string | null | undefined): string | null {
  if (!cardId || !UUID.test(cardId)) return null
  return `https://media.valorant-api.com/playercards/${cardId}/smallart.png`
}

export interface PlayerArtInput {
  playerCardId?: string | null
  agent?: string | null
}

export function playerAvatarArt(p: PlayerArtInput | null | undefined): { src: string; kind: 'card' | 'agent' } | null {
  if (!p) return null
  const card = playerCardSmallArt(p.playerCardId)
  if (card) return { src: card, kind: 'card' }
  const agent = getAgentImage(p.agent)
  if (agent) return { src: agent, kind: 'agent' }
  return null
}

/** "Platinum 2 · Jett" (+ its rank icon), or null when there is neither. */
export function playerRankLine(rank: string | null | undefined, agent: string | null | undefined): { text: string; icon: string | null } | null {
  const parts = [rank?.trim(), agent?.trim()].filter((s): s is string => !!s)
  if (!parts.length) return null
  return { text: parts.join(' · '), icon: getRankIconUrl(rank) }
}
