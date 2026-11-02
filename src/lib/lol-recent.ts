/**
 * League recent matches (GET /api/lol/matches/recent): the honest error state and the per-match
 * loadout (items, summoner spells, profile icon). Older API builds send none of these fields, so
 * every reader falls back to "no error, no loadout".
 */
import type { LolMatchSummary } from '../env.d.ts'
import { DDRAGON_BASE, FALLBACK_VERSION } from './lol'

/** `riot_unavailable` comes from the API; `request_failed` = the app couldn't reach UpForge. */
export type LolRecentError = 'riot_unavailable' | 'request_failed'
export type LolRecentReason = 'rate_limited' | 'bad_key' | 'riot_down' | 'unreachable' | 'not_configured' | 'riot_error'

export interface LolRecentResult {
  matches: LolMatchSummary[]
  error: LolRecentError | null
  errorReason: LolRecentReason | null
  /** Some match lookups failed; the rest are listed. */
  partial: boolean
}

const REASONS: readonly LolRecentReason[] = ['rate_limited', 'bad_key', 'riot_down', 'unreachable', 'not_configured', 'riot_error']

/** Read the API body (`{ matches, error?, error_reason?, partial? }`) defensively. */
export function normalizeLolRecent(data: unknown): LolRecentResult {
  const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
  const matches = Array.isArray(d.matches) ? d.matches as LolMatchSummary[] : []
  const error = d.error === 'riot_unavailable' ? 'riot_unavailable' : null
  const reason = typeof d.error_reason === 'string' && (REASONS as readonly string[]).includes(d.error_reason)
    ? d.error_reason as LolRecentReason
    : null
  return { matches, error, errorReason: error ? reason ?? 'riot_error' : null, partial: d.partial === true }
}

export const LOL_RECENT_ERROR_TITLE = 'Couldn’t reach Riot right now'

/** The reason in plain words (one sentence, then what to do). */
export function lolRecentErrorText(r: Pick<LolRecentResult, 'error' | 'errorReason'>): string {
  if (r.error === 'request_failed') return 'UpForge couldn’t be reached to load your League games. Check your connection and try again.'
  switch (r.errorReason) {
    case 'rate_limited': return 'Riot is limiting how often UpForge can ask for match data. Try again in a minute.'
    case 'riot_down': return 'Riot’s match service is having problems. Try again in a few minutes.'
    case 'unreachable': return 'UpForge’s server couldn’t connect to Riot. Try again in a few minutes.'
    case 'bad_key':
    case 'not_configured': return 'UpForge’s access to Riot match data isn’t working at the moment. This is on our side; try again later.'
    default: return 'Riot returned an error when UpForge asked for your games. Try again in a few minutes.'
  }
}

export const LOL_RECENT_PARTIAL_TEXT = 'Some of your games couldn’t be loaded from Riot. Showing the rest.'

// ── Loadout icons (Data Dragon, already allowed by the app CSP) ─────────────────

/** Data Dragon summoner spell `key` → image name. Unknown keys are left out (no guessed icon). */
const SUMMONER_SPELLS: Record<number, { file: string; name: string }> = {
  1: { file: 'SummonerBoost', name: 'Cleanse' },
  3: { file: 'SummonerExhaust', name: 'Exhaust' },
  4: { file: 'SummonerFlash', name: 'Flash' },
  6: { file: 'SummonerHaste', name: 'Ghost' },
  7: { file: 'SummonerHeal', name: 'Heal' },
  11: { file: 'SummonerSmite', name: 'Smite' },
  12: { file: 'SummonerTeleport', name: 'Teleport' },
  13: { file: 'SummonerMana', name: 'Clarity' },
  14: { file: 'SummonerDot', name: 'Ignite' },
  21: { file: 'SummonerBarrier', name: 'Barrier' },
  32: { file: 'SummonerSnowball', name: 'Mark' },
}

const int = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

export function lolItemIconUrl(id: number, version = FALLBACK_VERSION): string | null {
  return int(id) && id > 0 ? `${DDRAGON_BASE}/${version}/img/item/${id}.png` : null
}

export function lolSummonerSpell(key: number, version = FALLBACK_VERSION): { src: string; name: string } | null {
  const s = int(key) ? SUMMONER_SPELLS[key] : undefined
  return s ? { src: `${DDRAGON_BASE}/${version}/img/spell/${s.file}.png`, name: s.name } : null
}

export interface LolLoadoutIcon { key: string; src: string; label: string }
export interface LolLoadout {
  spells: LolLoadoutIcon[]
  /** Items in slot order, empty slots left out. */
  items: LolLoadoutIcon[]
  trinket: LolLoadoutIcon | null
}

type LoadoutSource = { items?: unknown; summoner_spells?: unknown } | null | undefined

/** Icons for one match's loadout: spells, then items (slot order), trinket last. Null when nothing is known. */
export function lolLoadout(m: LoadoutSource): LolLoadout | null {
  const rawItems = Array.isArray(m?.items) ? m!.items as unknown[] : []
  const rawSpells = Array.isArray(m?.summoner_spells) ? m!.summoner_spells as unknown[] : []
  const icon = (id: unknown, i: number): LolLoadoutIcon | null => {
    const src = int(id) ? lolItemIconUrl(id) : null
    return src ? { key: `i${i}-${id as number}`, src, label: i === 6 ? 'Trinket' : 'Item' } : null
  }
  const items = rawItems.slice(0, 6).map(icon).filter((x): x is LolLoadoutIcon => !!x)
  const trinket = icon(rawItems[6], 6)
  const spells = rawSpells.slice(0, 2).map((k, i) => {
    const s = int(k) ? lolSummonerSpell(k) : null
    return s ? { key: `s${i}-${k as number}`, src: s.src, label: s.name } : null
  }).filter((x): x is LolLoadoutIcon => !!x)
  return items.length || trinket || spells.length ? { spells, items, trinket } : null
}

/** The player's League profile icon id from recent matches (first one Riot sent), else null. */
export function lolProfileIconId(matches: ReadonlyArray<{ profile_icon_id?: number | null }> | null | undefined): number | null {
  for (const m of matches ?? []) {
    if (int(m.profile_icon_id) && m.profile_icon_id >= 0) return m.profile_icon_id
  }
  return null
}
