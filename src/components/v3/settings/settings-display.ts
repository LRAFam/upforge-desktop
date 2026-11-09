/**
 * Pure display helpers for the v3 Settings panes (no IPC, no Vue): shortcut keys per OS,
 * region defaults for the Riot link forms, the linked-account fallback while the list loads,
 * the local storage line, and when the report purchase is offered.
 */

// ── Shortcuts ────────────────────────────────────────────────────────────────

const MAC_KEYS: Record<string, string> = {
  CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Cmd: '⌘', Meta: '⌘', Super: '⌘',
  Control: '⌃', Ctrl: '⌃', Shift: '⇧', Alt: '⌥', Option: '⌥',
}
const PC_KEYS: Record<string, string> = {
  CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Control: 'Ctrl', Command: 'Win', Cmd: 'Win', Meta: 'Win', Super: 'Win',
}

/** An Electron accelerator ("CommandOrControl+Shift+U") as key caps for this OS: ⌘ ⇧ U on macOS, Ctrl Shift U elsewhere. */
export function shortcutKeyParts(accelerator: string, isMac: boolean): string[] {
  const map = isMac ? MAC_KEYS : PC_KEYS
  return accelerator.split('+').filter(Boolean).map(part => map[part] ?? part)
}

// ── Region defaults for the Riot link forms ──────────────────────────────────

export type ValorantRegion = 'na' | 'eu' | 'ap' | 'kr' | 'latam' | 'br'
const VALORANT_REGIONS: readonly ValorantRegion[] = ['na', 'eu', 'ap', 'kr', 'latam', 'br']

const LOL_TO_VALORANT: Record<string, ValorantRegion> = {
  EUW1: 'eu', EUN1: 'eu', TR1: 'eu', RU: 'eu', NA1: 'na', KR: 'kr', BR1: 'br', LA1: 'latam', LA2: 'latam', OC1: 'ap', JP1: 'ap',
}
const VALORANT_TO_LOL: Record<ValorantRegion, string> = { eu: 'EUW1', na: 'NA1', kr: 'KR', br: 'BR1', latam: 'LA1', ap: 'OC1' }

/** Best guess from the device time zone (no network): Europe → EU, Seoul → KR, Brazil → BR, Asia/Pacific → AP, Americas → NA. */
export function regionFromTimeZone(timeZone: string | null | undefined): ValorantRegion | null {
  if (!timeZone) return null
  if (timeZone === 'Asia/Seoul') return 'kr'
  if (/^America\/(Sao_Paulo|Fortaleza|Recife|Bahia|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Santarem|Noronha)$/.test(timeZone)) return 'br'
  if (/^America\/(Mexico_City|Bogota|Lima|Santiago|Buenos_Aires|Argentina\/.+|Caracas|Guatemala|Costa_Rica|Panama|Montevideo|Asuncion|La_Paz|Guayaquil|Monterrey|Tijuana|Havana|Santo_Domingo)$/.test(timeZone)) return 'latam'
  if (timeZone.startsWith('Europe/') || timeZone.startsWith('Africa/')) return 'eu'
  if (timeZone.startsWith('Asia/') || timeZone.startsWith('Australia/') || timeZone.startsWith('Pacific/')) return 'ap'
  if (timeZone.startsWith('America/')) return 'na'
  return null
}

export interface RegionHints {
  /** Valorant region already on the account (users.riot_region). */
  riotRegion?: string | null
  /** League platform already on the account (users.lol_platform). */
  lolPlatform?: string | null
  /** Device time zone, e.g. Intl.DateTimeFormat().resolvedOptions().timeZone. */
  timeZone?: string | null
}

const asValorant = (v: string | null | undefined): ValorantRegion | null => {
  const r = v?.toLowerCase()
  return r && (VALORANT_REGIONS as readonly string[]).includes(r) ? r as ValorantRegion : null
}

/** Default for the Valorant "Region" select: the account's region, else its League server, else the time zone, else NA. */
export function defaultValorantRegion(h: RegionHints): ValorantRegion {
  return asValorant(h.riotRegion)
    ?? (h.lolPlatform ? LOL_TO_VALORANT[h.lolPlatform.toUpperCase()] : undefined)
    ?? regionFromTimeZone(h.timeZone)
    ?? 'na'
}

/** Default for the League "Server" select: the account's server, else its Valorant region, else the time zone, else NA. */
export function defaultLolPlatform(h: RegionHints): string {
  if (h.lolPlatform && LOL_TO_VALORANT[h.lolPlatform.toUpperCase()]) return h.lolPlatform.toUpperCase()
  const region = asValorant(h.riotRegion) ?? regionFromTimeZone(h.timeZone) ?? 'na'
  return VALORANT_TO_LOL[region]
}

// ── Valorant accounts while the list loads ───────────────────────────────────

export interface ValorantAccountView {
  /** Row id from /api/riot-accounts; 0 for the placeholder built from the signed-in user. */
  id: number
  riot_name: string
  riot_tag: string
  riot_region?: string | null
  is_active: boolean
}

/**
 * The accounts to draw. The list call can land seconds after the page opens; until it does,
 * the signed-in user's own Riot ID (already known) is shown as the main so a linked account
 * never flashes an empty "Link Riot account" form.
 */
export function valorantAccountsView(
  rows: readonly ValorantAccountView[],
  loaded: boolean,
  user: { riot_name?: string | null; riot_tag?: string | null; riot_region?: string | null } | null | undefined,
): ValorantAccountView[] {
  if (rows.length || loaded) return [...rows]
  const name = user?.riot_name?.trim()
  const tag = user?.riot_tag?.trim()
  if (!name || !tag) return []
  return [{ id: 0, riot_name: name, riot_tag: tag, riot_region: user?.riot_region ?? null, is_active: true }]
}

// ── Storage line ─────────────────────────────────────────────────────────────

/** "1.2 GB saved on this PC · 69.9 GB free" — always says it's local, so it can't be confused with cloud counts. */
export function localStorageLine(bytes: number, freeLabel: string | null, formatBytes: (n: number) => string): string {
  const used = bytes > 0 ? `${formatBytes(bytes)} saved on this PC` : 'No recordings saved on this PC'
  return freeLabel ? `${used} · ${freeLabel} free` : used
}

/** "2 untracked files (1.2 GB) will be deleted in 5 days …" — the visible countdown before auto-removal. */
export function untrackedCountdownLine(
  b: { orphanScheduledCount: number; orphanScheduledBytes: number; orphanDeleteAt: number | null },
  formatBytes: (n: number) => string,
  now = Date.now(),
): string {
  if (b.orphanScheduledCount <= 0 || b.orphanDeleteAt == null) return ''
  const days = Math.max(0, Math.ceil((b.orphanDeleteAt - now) / (24 * 60 * 60 * 1000)))
  const when = days <= 1 ? 'within a day' : `in ${days} days`
  const what = b.orphanScheduledCount === 1 ? '1 untracked file' : `${b.orphanScheduledCount} untracked files`
  return `${what} (${formatBytes(b.orphanScheduledBytes)}) will be deleted ${when} by auto-delete. Move ${b.orphanScheduledCount === 1 ? 'it' : 'them'} out of the recordings folder to keep ${b.orphanScheduledCount === 1 ? 'it' : 'them'}.`
}

// ── Report purchase ──────────────────────────────────────────────────────────

/** Buying report credits only makes sense when the plan has a cap; unlimited plans (and admins) never see it. */
export function canBuyReports(reports: { limit: number | null }): boolean {
  return reports.limit !== null
}

/** The purchased-credit line: always on capped plans, and on unlimited plans only when credits were bought. */
export function showPurchasedReports(reports: { limit: number | null; purchased: number }): boolean {
  return reports.limit !== null || reports.purchased > 0
}
