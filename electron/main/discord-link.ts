/**
 * Settings › Account › Discord: start the existing web OAuth link from the desktop.
 *
 * The API (already authenticated with the desktop token) returns a Discord authorise URL whose
 * one-time state carries the user's identity, so the browser needs no UpForge login. Discord sends
 * the user to upforge.gg/auth/discord/callback, which finishes the link. The app then re-reads the
 * profile (`discord_username`) when the user comes back.
 */

export interface DiscordLinkDeps {
  /** GET with the user's token; null when logged out. */
  get: ((path: string) => Promise<{ status: number; data: unknown }>) | null
  openExternal: (url: string) => Promise<void> | void
}

export type DiscordLinkResult =
  | { ok: true }
  | { ok: false; error: string }

/** Only Discord's own https authorise page may be opened from the API answer. */
export function isDiscordAuthorizeUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.protocol === 'https:'
      && (u.hostname === 'discord.com' || u.hostname === 'discordapp.com')
      && u.pathname.startsWith('/oauth2/authorize')
  } catch {
    return false
  }
}

export async function startDiscordLink(deps: DiscordLinkDeps): Promise<DiscordLinkResult> {
  if (!deps.get) return { ok: false, error: 'Sign in again to link Discord.' }
  let res: { status: number; data: unknown }
  try {
    res = await deps.get('/api/auth/discord/redirect')
  } catch {
    return { ok: false, error: 'Could not reach UpForge. Try again in a moment.' }
  }
  const data = res.data as { url?: unknown; message?: unknown } | null
  if (res.status >= 200 && res.status < 300 && isDiscordAuthorizeUrl(data?.url)) {
    await deps.openExternal(data.url)
    return { ok: true }
  }
  if (res.status === 429) return { ok: false, error: 'Too many link attempts. Try again in an hour.' }
  return { ok: false, error: 'Discord linking is unavailable right now. Try again later.' }
}
