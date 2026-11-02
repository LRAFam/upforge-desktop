/**
 * Display names for game data shown in v3 (audit 2026-11-02 — shell).
 * Raw values from demos, the API and recordings ("de_vertigo", "DE_VERTIGO", "CS2 VOD") are never
 * shown as-is: maps read "Vertigo", sources read "CS2 VOD". One helper for every screen.
 */
import { cs2MapDisplayName, normalizeCs2MapKey } from '../../../lib/cs2-maps'
import { GAME_BRAND } from '../../../lib/game-branding'
import type { PrimaryGame } from '../../../lib/games'
import { formatGameMode, formatMapLabel } from '../../../lib/valorant'

/** Official CS2 / CS:GO map names that aren't in the radar manifest (which only lists radars we ship). */
const CS2_EXTRA_MAPS: Record<string, string> = {
  de_vertigo: 'Vertigo',
  de_train: 'Train',
  de_cache: 'Cache',
  de_cbble: 'Cobblestone',
  de_dust: 'Dust',
  de_dust2: 'Dust II',
  de_basalt: 'Basalt',
  de_edin: 'Edin',
  de_palais: 'Palais',
  de_whistle: 'Whistle',
  de_thera: 'Thera',
  de_mills: 'Mills',
  de_memento: 'Memento',
  de_assembly: 'Assembly',
  de_shoots: 'Shoots',
  de_jura: 'Jura',
  de_grail: 'Grail',
  de_brewery: 'Brewery',
  de_golden: 'Golden',
  de_rooftop: 'Rooftop',
  de_sanctum: 'Sanctum',
  de_poseidon: 'Poseidon',
  de_stronghold: 'Stronghold',
  cs_office: 'Office',
  cs_italy: 'Italy',
  cs_agency: 'Agency',
  ar_shoots: 'Shoots',
  ar_baggage: 'Baggage',
  ar_pool_day: 'Pool Day',
}

/** Words that stay upper-case in labels ("CS2 VOD", not "Cs2 Vod"). */
const ACRONYMS: Record<string, string> = {
  cs2: 'CS2', csgo: 'CS:GO', vod: 'VOD', faceit: 'FACEIT', mm: 'MM', aram: 'ARAM', lol: 'League',
  tdm: 'TDM', ai: 'AI', fps: 'FPS', id: 'ID', mvp: 'MVP', hud: 'HUD',
}

function titleWords(raw: string): string {
  return raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase()
      return ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

/** "de_vertigo" / "DE_VERTIGO" / "maps/de_vertigo.bsp" → "Vertigo". Unknown prefixed maps lose the prefix. */
function cs2Map(raw: string): string {
  const key = normalizeCs2MapKey(raw.replace(/\.(bsp|vpk|dem)$/i, ''))
    ?? (/^ar_/i.test(raw.trim()) ? raw.trim().toLowerCase() : null)
  if (!key) return titleWords(raw)
  const manifest = cs2MapDisplayName(key)
  if (manifest && manifest !== key) return manifest
  return CS2_EXTRA_MAPS[key] ?? titleWords(key.replace(/^(de|cs|ar)_/, ''))
}

/**
 * Human map name for any game. `game` may be unknown (e.g. a mixed list): a de_/cs_/ar_ prefix is
 * read as CS2. Returns '' for missing input so callers can fall back with `||`.
 */
export function mapDisplayName(game: PrimaryGame | string | null | undefined, raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  if (game === 'cs2' || /^(de|cs|ar)_/i.test(value.split(/[\\/]/).pop() ?? value)) return cs2Map(value)
  if (game === 'valorant' || game == null || game === '') {
    const label = formatMapLabel(value)
    return /[_/]/.test(label) ? titleWords(label.split('/').pop() ?? label) : label
  }
  // Deadlock / League / anything else: keep proper names as written, only tidy raw ids.
  return /[_]|^[a-z0-9]+$|^[A-Z0-9]+$/.test(value) ? titleWords(value) : value
}

/** Match source / mode label: "CS2 VOD", "cs2_vod" → "CS2 VOD"; Valorant queue ids use the existing labels. */
export function modeDisplayName(game: PrimaryGame | string | null | undefined, raw: string | null | undefined): string {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (!value) return ''
  if (game === 'valorant') return formatGameMode(value)
  return titleWords(value)
}

export interface TitleBarGame { id: PrimaryGame; name: string; logo: string; accent: string }

/** Title-bar switcher entries: the same square marks the rest of the app uses, plus each game's v3 accent token. */
export function titleBarGames(): TitleBarGame[] {
  const names: Record<PrimaryGame, string> = { valorant: 'Valorant', cs2: 'CS2', deadlock: 'Deadlock', lol: 'League' }
  return (['valorant', 'cs2', 'deadlock', 'lol'] as const).map(id => ({
    id,
    name: names[id],
    logo: GAME_BRAND[id].logo,
    accent: `var(--uf-game-${id})`,
  }))
}
