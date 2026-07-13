/** Desktop LoL CDN + rank helpers (mirrors web lol-cdn / lol-ranks). */

const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn'
/** Keep current so new champions don't 404 when versions.json isn't fetched. */
const FALLBACK_VERSION = '16.13.1'

const EMBLEM_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/ranked-emblems'

const ROLE_ICON_BASE =
  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions'

const CHAMPION_KEY_ALIASES: Record<string, string> = {
  fiddlesticks: 'Fiddlesticks',
  chogath: 'Chogath',
  kaisa: 'Kaisa',
  khazix: 'Khazix',
  velkoz: 'Velkoz',
  belveth: 'Belveth',
  leblanc: 'Leblanc',
  nunuwillump: 'Nunu',
  nunu: 'Nunu',
  monkeyking: 'MonkeyKing',
  renataglasc: 'Renata',
  wukong: 'MonkeyKing',
}

function normalizeChampionKey(name: string): string {
  const raw = name.trim().replace(/[^a-zA-Z0-9]/g, '')
  if (!raw) return ''
  const alias = CHAMPION_KEY_ALIASES[raw.toLowerCase()]
  if (alias) return alias
  return raw.replace(/^(.)/, (m) => m.toUpperCase())
}

export function championIconUrl(championName: string, version = FALLBACK_VERSION): string {
  const key = normalizeChampionKey(championName)
  if (!key) return ''
  return `${DDRAGON_BASE}/${version}/img/champion/${key}.png`
}

export function championSplashUrl(championName: string, skinNum = 0): string {
  const key = normalizeChampionKey(championName)
  if (!key) return ''
  return `${DDRAGON_BASE}/img/champion/splash/${key}_${skinNum}.jpg`
}

export function summonersRiftMapUrl(version = FALLBACK_VERSION): string {
  return `${DDRAGON_BASE}/${version}/img/map/map11.png`
}

function parseTier(rank: string | null | undefined): string {
  const value = (rank ?? '').toLowerCase().trim()
  if (!value || value === 'unranked') return 'unranked'
  if (value.includes('iron')) return 'iron'
  if (value.includes('bronze')) return 'bronze'
  if (value.includes('silver')) return 'silver'
  if (value.includes('gold')) return 'gold'
  if (value.includes('plat')) return 'platinum'
  if (value.includes('emerald')) return 'emerald'
  if (value.includes('diamond')) return 'diamond'
  if (value.includes('grandmaster') || value.includes('grand master')) return 'grandmaster'
  if (value.includes('master')) return 'master'
  if (value.includes('challenger')) return 'challenger'
  return 'unranked'
}

export function lolRankEmblemUrl(rank: string | null | undefined): string {
  const tier = parseTier(rank)
  if (tier === 'unranked') return `${EMBLEM_BASE}/emblem-unranked.png`
  return `${EMBLEM_BASE}/emblem-${tier}.png`
}

export function lolRoleIconUrl(role: string | null | undefined): string {
  const key = (role ?? '').toUpperCase().replace(/\s+/g, '_')
  const map: Record<string, string> = {
    TOP: 'icon-top.png',
    JUNGLE: 'icon-jungle.png',
    MIDDLE: 'icon-mid.png',
    MID: 'icon-mid.png',
    BOTTOM: 'icon-bottom.png',
    ADC: 'icon-bottom.png',
    UTILITY: 'icon-utility.png',
    SUPPORT: 'icon-utility.png',
  }
  const file = map[key]
  return file ? `${ROLE_ICON_BASE}/${file}` : ''
}

export function getChampionImage(championName: string | null | undefined): string {
  if (!championName) return ''
  return championIconUrl(championName)
}

export function getRankImage(rank: string | null | undefined): string {
  return lolRankEmblemUrl(rank)
}

export function getMapImage(): string {
  return summonersRiftMapUrl()
}

export { resolveLolMapLabel } from './lol-maps'

export function lolQueueLabel(queueId: number | null | undefined): string {
  if (queueId === 420) return 'Ranked Solo/Duo'
  if (queueId == null) return "Summoner's Rift"
  return `Queue ${queueId}`
}
