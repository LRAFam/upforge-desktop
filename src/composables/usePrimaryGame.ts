import { ref, computed } from 'vue'
import {
  normalizePrimaryGame,
  primaryGameLabel,
  type PrimaryGame,
} from '../lib/games'

const primaryGame = ref<PrimaryGame>('valorant')

/** Games the aim trainer converts sensitivity for (upforge-trainer MouseSensitivity.gd). */
const TRAINER_SENS_GAMES: ReadonlySet<PrimaryGame> = new Set(['valorant', 'cs2', 'deadlock'])

/** Settings to save on a game switch: the trainer's sensitivity game follows only for games it supports. */
export function primaryGameSwitchPatch(game: PrimaryGame, trainerMouse: Record<string, unknown> | undefined): { primaryGame: PrimaryGame; trainerMouse?: Record<string, unknown> } {
  return TRAINER_SENS_GAMES.has(game) ? { primaryGame: game, trainerMouse: { ...trainerMouse, game } } : { primaryGame: game }
}
let loaded = false

export function usePrimaryGame() {
  const label = computed(() => primaryGameLabel(primaryGame.value))
  const isValorant = computed(() => primaryGame.value === 'valorant')
  const isCs2 = computed(() => primaryGame.value === 'cs2')
  const isDeadlock = computed(() => primaryGame.value === 'deadlock')
  const isLol = computed(() => primaryGame.value === 'lol')

  async function loadFromSettings(): Promise<PrimaryGame> {
    try {
      const settings = await window.api.settings.get()
      primaryGame.value = normalizePrimaryGame(settings.primaryGame ?? settings.trainerMouse?.game)
    } catch {
      primaryGame.value = 'valorant'
    }
    loaded = true
    return primaryGame.value
  }

  async function setPrimaryGame(game: PrimaryGame): Promise<void> {
    const current = await window.api.settings.get()
    await window.api.settings.save(primaryGameSwitchPatch(game, current.trainerMouse) as Parameters<typeof window.api.settings.save>[0])
    primaryGame.value = game
  }

  function applyFromSettings(partial: { primaryGame?: string; trainerMouse?: { game?: string } }): void {
    primaryGame.value = normalizePrimaryGame(
      partial.primaryGame ?? partial.trainerMouse?.game,
    )
    loaded = true
  }

  return {
    primaryGame,
    label,
    isValorant,
    isCs2,
    isDeadlock,
    isLol,
    loadFromSettings,
    setPrimaryGame,
    applyFromSettings,
    isLoaded: () => loaded,
  }
}
