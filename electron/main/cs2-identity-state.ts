/**
 * Who "you" are in CS2 demos, shared between identity lookup (async, API) and the demo parser (sync).
 *
 * Matching prefers the Steam64 saved on the account over names (names change and collide). When a
 * demo is matched confidently by name and the account has no Steam64 yet, we save the Steam64 the
 * demo shows, which also unlocks Premier / Leetify on Progress.
 */
export type Cs2NameSource = 'override' | 'api' | 'faceit' | 'persona' | 'account' | null
export type Cs2LocalMatch = 'steam' | 'name' | 'inferred' | null

interface State {
  steamId: string | null
  nameSource: Cs2NameSource
  save: ((steamId: string) => Promise<void>) | null
  saved: Set<string>
}

const state: State = { steamId: null, nameSource: null, save: null, saved: new Set() }

const STEAM64 = /^7656119\d{10}$/

export function setKnownCs2Identity(steamId: string | null | undefined, nameSource: Cs2NameSource): void {
  state.steamId = steamId && STEAM64.test(steamId.trim()) ? steamId.trim() : null
  state.nameSource = nameSource
}

export function setCs2SteamIdSaver(save: ((steamId: string) => Promise<void>) | null): void {
  state.save = save
}

export function getKnownCs2SteamId(): string | null {
  return state.steamId
}

/**
 * Only save when the match is trustworthy: a name we got from the player themselves (settings,
 * their UpForge identity, FACEIT, or the local Steam persona) that is unique in the lobby. Never for
 * the account-name fallback or a guess from kill patterns, and never over a different saved Steam64.
 */
export function shouldSaveCs2SteamId(opts: {
  parsedSteamId: string | null | undefined
  matchedBy: Cs2LocalMatch
  nameUnique: boolean
  knownSteamId: string | null
  nameSource: Cs2NameSource
}): boolean {
  const id = opts.parsedSteamId?.trim()
  if (!id || !STEAM64.test(id)) return false
  if (opts.knownSteamId) return false
  if (opts.matchedBy !== 'name' || !opts.nameUnique) return false
  return opts.nameSource === 'override' || opts.nameSource === 'api' || opts.nameSource === 'faceit' || opts.nameSource === 'persona'
}

/** Called by the demo parser once it has picked the local player. Best-effort, at most once per id. */
export function rememberParsedCs2SteamId(parsedSteamId: string | null | undefined, matchedBy: Cs2LocalMatch, nameUnique: boolean): boolean {
  const ok = shouldSaveCs2SteamId({ parsedSteamId, matchedBy, nameUnique, knownSteamId: state.steamId, nameSource: state.nameSource })
  if (!ok || !state.save || state.saved.has(parsedSteamId!)) return false
  const id = parsedSteamId!.trim()
  state.saved.add(id)
  state.steamId = id
  void state.save(id).catch(() => { state.saved.delete(id) })
  return true
}

/** Test helper. */
export function resetCs2IdentityState(): void {
  state.steamId = null
  state.nameSource = null
  state.save = null
  state.saved.clear()
}
