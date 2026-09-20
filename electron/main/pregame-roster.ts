export interface PregamePlayer {
  Subject?: string
  CharacterID?: string
  CharacterSelectionState?: string
}

/** A hovered pick can change; only locked picks are coaching evidence. */
export function lockedPregamePlayers(players?: PregamePlayer[]): PregamePlayer[] {
  return (players ?? []).filter((player) => player.CharacterSelectionState === 'locked' && !!player.CharacterID)
}
