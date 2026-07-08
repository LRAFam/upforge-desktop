import log from 'electron-log'
import type { AuthManager } from './auth-manager'
import type { SettingsManager } from './settings-manager'
import { getSteamPersonaName } from './cs2-steam-setup'

/** Resolve the in-game / demo player name for CS2 clip extraction. */
export async function resolveCs2LocalPlayerName(
  settings: SettingsManager,
  auth: AuthManager,
): Promise<string | null> {
  const override = settings.get().cs2SteamName?.trim()
  if (override) return override

  try {
    const api = auth.getApi()
    if (api) {
      const identityRes = await api.get('/api/cs2/identity')
      const apiName = (identityRes.data as { identity?: { steam_display_name?: string | null } })?.identity?.steam_display_name?.trim()
      if (apiName) return apiName
    }
  } catch {
    /* optional */
  }

  try {
    const api = auth.getApi()
    if (api) {
      const res = await api.get('/api/cs2/faceit/connection')
      const nickname = (res.data as { nickname?: string | null })?.nickname?.trim()
      if (nickname) return nickname
    }
  } catch {
    /* not linked */
  }

  const persona = await getSteamPersonaName()
  if (persona) return persona

  const accountName = auth.getUser()?.name?.trim()
  if (accountName) {
    log.info('[CS2Player] Using account name for demo matching:', accountName)
    return accountName
  }

  return null
}
