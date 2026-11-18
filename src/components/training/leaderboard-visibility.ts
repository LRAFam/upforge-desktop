/**
 * Leaderboards show every player by default with the name and tag from their latest Riot snapshot
 * (else their account name), rank and player card. The app says so and offers the account's opt-out
 * (`leaderboard_opt_in`, the same switch as the website's privacy settings).
 */
export const HIDDEN_NOTE = 'You are hidden from leaderboards.'

/** The name other players see for you, as best the app knows it. */
export function leaderboardDisplayName(user: { name?: string | null; riot_name?: string | null; riot_tag?: string | null } | null | undefined): string | null {
  if (user?.riot_name) return user.riot_tag ? `${user.riot_name}#${user.riot_tag}` : user.riot_name
  return user?.name?.trim() || null
}

/** One line under the filters, or null until the setting is known. */
export function visibilityLine(visible: boolean | null, displayName: string | null): string | null {
  if (visible === null) return null
  if (!visible) return `${HIDDEN_NOTE} Other players can’t see your name or scores.`
  return displayName
    ? `Signed-in players see you here as ${displayName}, with your rank and player card.`
    : 'Signed-in players see your name, rank and player card here.'
}

/** The "You" row note: a hidden player is told they are hidden, not that they will appear. */
export function youNote(note: string, visible: boolean | null): string {
  return visible === false ? HIDDEN_NOTE : note
}
