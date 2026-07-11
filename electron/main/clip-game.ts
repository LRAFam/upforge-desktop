/** Game context stored on each local clip. */
export type ClipGame = 'valorant' | 'cs2' | 'deadlock' | 'lol'

export function normalizeClipGame(value: string | null | undefined): ClipGame {
  if (value === 'cs2' || value === 'deadlock' || value === 'lol') return value
  return 'valorant'
}

/** Legacy clips without `game` are treated as Valorant (pre-multi-game store). */
export function resolveClipGame(clip: { game?: ClipGame | null }): ClipGame {
  return clip.game ? normalizeClipGame(clip.game) : 'valorant'
}

export function clipMatchesGame(clip: { game?: ClipGame | null }, game: ClipGame): boolean {
  return resolveClipGame(clip) === normalizeClipGame(game)
}
