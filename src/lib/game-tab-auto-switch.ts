import { isPrimaryGame, type PrimaryGame } from './games'

/**
 * Game tab to switch to when a game's in-game process starts (`game:status-changed`).
 * Conservative on purpose (auto-switch was removed in 2.9.1 for multi-game flip-flops):
 * only on a start event, only when nothing is recording, never during onboarding.
 */
export function gameTabToAutoSwitch(input: {
  event: unknown
  current: PrimaryGame
  recording: boolean
  enabled: boolean
  onboarding: boolean
}): PrimaryGame | null {
  if (!input.enabled || input.recording || input.onboarding) return null
  const event = input.event as { game?: unknown; active?: unknown } | null | undefined
  if (!event || event.active !== true || typeof event.game !== 'string') return null
  if (!isPrimaryGame(event.game) || event.game === input.current) return null
  return event.game
}
