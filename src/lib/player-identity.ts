/**
 * One player-identity model for every place a person appears (title bar, Settings, Squad,
 * Coaches, Students, leaderboards, scoreboards). Turns whatever a screen knows about a person,
 * in any game, into { avatar, banner, rankIcon, rankLabel, title, level }. Every field is null
 * when the data doesn't have it — never a stand-in image or a guessed rank.
 *
 * Avatar order: uploaded photo (coach profile) → Valorant player card → main agent portrait →
 * League profile icon. `avatars` keeps the whole chain so <PlayerAvatar> can step to the next
 * image when one fails to load (e.g. a photo host the app's CSP blocks); the letter is last.
 * See docs/design/ui-v3/notes-identity.md for what each game provides.
 */
import { getAgentImage, getRankIconUrl } from './valorant'
import { lolRankEmblemUrl } from './lol'
import { getCs2RankIconUrl, getFaceitLevelIconUrl } from './cs2'
import { getDeadlockRankIconUrl } from './deadlock'
import { initial } from './name-initial'

export type IdentityGame = 'valorant' | 'cs2' | 'deadlock' | 'league' | 'lol'

export interface PersonInput {
  /** Game the screen is about; defaults to Valorant (the only game with player cards). */
  game?: IdentityGame | string | null
  name?: string | null
  /** Uploaded photo (coach profile `avatar_url`). Only https URLs are used. */
  avatarUrl?: string | null
  /** Uploaded banner (coach profile `banner_url`). */
  bannerUrl?: string | null
  /** Valorant player card UUID (snapshot `player_card_id`). */
  playerCardId?: string | null
  /** Valorant main/most-played agent, or a coach's `main_agents` (first one used). */
  agent?: string | null
  agents?: readonly string[] | null
  /** Rank text as the API sends it ("Platinum 2", "Immo 3", "GOLD II", "Archon"). */
  rank?: string | null
  /** Valorant competitive tier number (3–27) from match data. */
  rankTier?: number | null
  /** Deadlock rank subtier 1–6. */
  rankSubtier?: number | null
  /** CS2 FACEIT level 1–10. */
  faceitLevel?: number | null
  /** CS2 Premier rating. */
  premierRating?: number | null
  /** League profile icon id. */
  profileIconId?: number | null
  /** Valorant account level / League summoner level. */
  level?: number | null
  /** Player title text, when a source has already resolved it. */
  title?: string | null
}

export type AvatarKind = 'photo' | 'card' | 'agent' | 'icon'
export interface IdentityImage { src: string; kind: AvatarKind }

export interface PlayerIdentity {
  name: string
  initial: string
  avatar: IdentityImage | null
  /** Full fallback chain (first = `avatar`). */
  avatars: IdentityImage[]
  banner: string | null
  rankIcon: string | null
  rankLabel: string | null
  title: string | null
  level: number | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALORANT_TIERS_UUID = '03621f52-342b-cf4e-4f86-9350a49c6d04'
const CDRAGON_PROFILE_ICONS = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons'

/** Valorant player card art: `small` square (avatar), `wide` banner strip, `large` tall. */
export function valorantCardArt(cardId: string | null | undefined, kind: 'small' | 'wide' | 'large' = 'small'): string | null {
  if (!cardId || !UUID.test(cardId)) return null
  return `https://media.valorant-api.com/playercards/${cardId.toLowerCase()}/${kind}art.png`
}

/** Valorant rank icon from the numeric competitive tier (3 = Iron 1 … 27 = Radiant). */
export function valorantTierIcon(tier: number | null | undefined): string | null {
  if (tier == null || !Number.isInteger(tier) || tier < 3 || tier > 27) return null
  return `https://media.valorant-api.com/competitivetiers/${VALORANT_TIERS_UUID}/${tier}/smallicon.png`
}

const VALORANT_TIER_WORDS: Record<string, string> = {
  iron: 'Iron', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', plat: 'Platinum', platinum: 'Platinum',
  dia: 'Diamond', diamond: 'Diamond', asc: 'Ascendant', ascendant: 'Ascendant', immo: 'Immortal', imm: 'Immortal',
  immortal: 'Immortal', radiant: 'Radiant',
}

/**
 * "Immo 3" / "asc 1" / "PLATINUM 2" / "Radiant" → "Immortal 3" / "Ascendant 1" / "Platinum 2" / "Radiant".
 * A tier without a division ("Immortal") stays as the tier name; anything else → null.
 */
export function normaliseValorantRank(rank: string | null | undefined): string | null {
  const m = /^\s*([a-z]+)\.?\s*([1-3])?\s*$/i.exec(rank ?? '')
  if (!m) return null
  const tier = VALORANT_TIER_WORDS[m[1].toLowerCase()]
  if (!tier) return null
  if (tier === 'Radiant') return 'Radiant'
  return m[2] ? `${tier} ${m[2]}` : tier
}

/** Valorant rank icon from rank text, accepting the short forms coaches type ("Immo 3"). */
export function valorantRankIcon(rank: string | null | undefined): string | null {
  return getRankIconUrl(normaliseValorantRank(rank))
}

/** League profile icon (CommunityDragon, already allowed by the app CSP). */
export function leagueProfileIcon(id: number | null | undefined): string | null {
  if (id == null || !Number.isInteger(id) || id < 0) return null
  return `${CDRAGON_PROFILE_ICONS}/${id}.jpg`
}

function httpsUrl(url: string | null | undefined): string | null {
  const v = (url ?? '').trim()
  return /^https:\/\/\S+$/i.test(v) ? v : null
}

function gameOf(g: PersonInput['game']): 'valorant' | 'cs2' | 'deadlock' | 'league' {
  const v = (g ?? 'valorant').toLowerCase()
  if (v === 'lol' || v === 'league') return 'league'
  if (v === 'cs2' || v === 'deadlock') return v
  return 'valorant'
}

function rankFor(game: ReturnType<typeof gameOf>, p: PersonInput): { icon: string | null; label: string | null } {
  const raw = p.rank?.trim() || null
  if (game === 'valorant') {
    const named = normaliseValorantRank(raw)
    const icon = valorantTierIcon(p.rankTier) ?? valorantRankIcon(named)
    return { icon, label: named ?? (raw && !/^unrank/i.test(raw) ? raw : null) }
  }
  if (game === 'league') {
    if (!raw || /^unrank/i.test(raw)) return { icon: null, label: null }
    const icon = lolRankEmblemUrl(raw)
    return { icon: icon.endsWith('/unranked.svg') ? null : icon, label: raw }
  }
  if (game === 'cs2') {
    const faceit = getFaceitLevelIconUrl(p.faceitLevel)
    if (faceit) return { icon: faceit, label: `FACEIT level ${Math.max(1, Math.min(10, Math.round(p.faceitLevel!)))}` }
    if (p.premierRating != null && p.premierRating > 0) return { icon: null, label: `Premier ${p.premierRating.toLocaleString('en-GB')}` }
    return { icon: getCs2RankIconUrl(raw), label: raw }
  }
  return { icon: getDeadlockRankIconUrl(raw, p.rankSubtier), label: raw }
}

export function playerIdentity(p: PersonInput | null | undefined): PlayerIdentity {
  const person = p ?? {}
  const game = gameOf(person.game)
  const name = person.name?.trim() || ''
  const avatars: IdentityImage[] = []
  const push = (src: string | null | undefined, kind: AvatarKind) => {
    if (src && !avatars.some(a => a.src === src)) avatars.push({ src, kind })
  }
  push(httpsUrl(person.avatarUrl), 'photo')
  if (game === 'valorant') {
    push(valorantCardArt(person.playerCardId, 'small'), 'card')
    push(getAgentImage(person.agent ?? person.agents?.find(a => !!a?.trim()) ?? null) || null, 'agent')
  }
  if (game === 'league') push(leagueProfileIcon(person.profileIconId), 'icon')

  const rank = rankFor(game, person)
  const banner = httpsUrl(person.bannerUrl) ?? (game === 'valorant' ? valorantCardArt(person.playerCardId, 'wide') : null)
  const level = person.level != null && Number.isFinite(person.level) && person.level > 0 ? Math.round(person.level) : null

  return {
    name,
    initial: initial(name),
    avatar: avatars[0] ?? null,
    avatars,
    banner,
    rankIcon: rank.icon,
    rankLabel: rank.label,
    title: person.title?.trim() || null,
    level,
  }
}
