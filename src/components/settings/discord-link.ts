/** Settings › Account › Discord row (pure helpers). */

/** Route to the Discord row, used by "Link Discord" prompts (e.g. the pre-game brief skip message). */
export const DISCORD_LINK_ROUTE = { path: '/settings', query: { tab: 'account', section: 'discord-link' } } as const

/** The linked Discord name from the signed-in user, or null when not linked. */
export function linkedDiscordName(user: { discord_username?: string | null } | null | undefined): string | null {
  const name = typeof user?.discord_username === 'string' ? user.discord_username.trim() : ''
  return name || null
}

/** After "Link Discord", re-check the profile for this long (the OAuth finishes in the browser). */
export const DISCORD_WAIT_MS = 3 * 60_000
export const DISCORD_POLL_MS = 10_000

export function stillWaiting(startedAt: number | null, now: number): boolean {
  return startedAt != null && now - startedAt < DISCORD_WAIT_MS
}
