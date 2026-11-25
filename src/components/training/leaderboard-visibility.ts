/**
 * Leaderboards show every player by default with the name and tag from their latest Riot snapshot
 * (else their account name), rank and player card. The app says so and offers the account's opt-out
 * (`leaderboard_opt_in`, the same switch as the website's privacy settings).
 */
export const HIDDEN_NOTE = 'You are hidden from leaderboards.'

/** Anything shaped like an email address. Never shown on a public board. Same rule as the API's PublicName. */
export function looksLikeEmail(name: string | null | undefined): boolean {
  return !!name && /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(name)
}

/**
 * The generated public name for an account whose name is empty or an email: "Player-" + 4 hex digits.
 * Same formula as the API's `App\Support\PublicName::alias` (upper 16 bits of a Knuth multiplicative hash).
 */
export function publicAlias(userId: number): string {
  const hash = (Math.imul(userId, 2654435761 | 0) >>> 0) >>> 16
  return `Player-${hash.toString(16).toUpperCase().padStart(4, '0')}`
}

/** A board row's name, masked if an older API ever sends an email-shaped one. */
export function safeBoardName(name: string | null | undefined, userId: number): string {
  const trimmed = name?.trim() ?? ''
  return !trimmed || looksLikeEmail(trimmed) ? publicAlias(userId) : trimmed
}

/** The name other players see for you, as best the app knows it. */
export function leaderboardDisplayName(user: { id?: number | null; name?: string | null; riot_name?: string | null; riot_tag?: string | null } | null | undefined): string | null {
  if (user?.riot_name) return user.riot_tag ? `${user.riot_name}#${user.riot_tag}` : user.riot_name
  const name = user?.name?.trim() || null
  if (typeof user?.id === 'number' && (!name || looksLikeEmail(name))) return publicAlias(user.id)
  return name && !looksLikeEmail(name) ? name : null
}

/** One line under the filters, or null until the setting is known. */
export function visibilityLine(visible: boolean | null, displayName: string | null): string | null {
  if (visible === null) return null
  if (!visible) return `${HIDDEN_NOTE} Other players can’t see your name or scores.`
  return displayName
    ? `Signed-in players see you here as ${displayName}, with your rank and player card.${/^Player-[0-9A-F]{4}$/.test(displayName) ? ' This name is generated so your email stays private. Link your Riot ID or change your account name to use your own.' : ''}`
    : 'Signed-in players see your name, rank and player card here.'
}

/** The "You" row note: a hidden player is told they are hidden, not that they will appear. */
export function youNote(note: string, visible: boolean | null): string {
  return visible === false ? HIDDEN_NOTE : note
}
