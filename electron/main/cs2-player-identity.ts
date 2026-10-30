import log from 'electron-log'
import type { AuthManager } from './auth-manager'
import type { SettingsManager } from './settings-manager'
import { getSteamPersonaName } from './cs2-steam-setup'
import { setCs2SteamIdSaver, setKnownCs2Identity } from './cs2-identity-state'

/** Resolve the in-game / demo player name for CS2 clip extraction. */
export async function resolveCs2LocalPlayerName(
  settings: SettingsManager,
  auth: AuthManager,
): Promise<string | null> {
  // The demo parser prefers this Steam64 over any name; when it's missing, a confident name match saves it.
  setCs2SteamIdSaver((steamId) => auth.syncCs2SteamId(steamId))
  let savedSteamId: string | null = null
  let apiName: string | undefined

  try {
    const api = auth.getApi()
    if (api) {
      const identityRes = await api.get('/api/cs2/identity')
      const identity = (identityRes.data as { identity?: { steam_display_name?: string | null; steam_id?: string | null } })?.identity
      apiName = identity?.steam_display_name?.trim() || undefined
      savedSteamId = identity?.steam_id?.trim() || null
    }
  } catch {
    /* optional */
  }

  const override = settings.get().cs2SteamName?.trim()
  if (override) { setKnownCs2Identity(savedSteamId, 'override'); return override }
  if (apiName) { setKnownCs2Identity(savedSteamId, 'api'); return apiName }

  try {
    const api = auth.getApi()
    if (api) {
      const res = await api.get('/api/cs2/faceit/connection')
      const nickname = (res.data as { nickname?: string | null })?.nickname?.trim()
      if (nickname) { setKnownCs2Identity(savedSteamId, 'faceit'); return nickname }
    }
  } catch {
    /* not linked */
  }

  const persona = await getSteamPersonaName()
  if (persona) { setKnownCs2Identity(savedSteamId, 'persona'); return persona }

  const accountName = auth.getUser()?.name?.trim()
  if (accountName) {
    log.info('[CS2Player] Using account name for demo matching:', accountName)
    setKnownCs2Identity(savedSteamId, 'account')
    return accountName
  }

  setKnownCs2Identity(savedSteamId, null)
  return null
}
