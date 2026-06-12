import { ref, computed } from 'vue'
import {
  normalizePrimaryGame,
  primaryGameLabel,
  type PrimaryGame,
} from '../lib/games'

const primaryGame = ref<PrimaryGame>('valorant')
let loaded = false

export function usePrimaryGame() {
  const label = computed(() => primaryGameLabel(primaryGame.value))
  const isValorant = computed(() => primaryGame.value === 'valorant')
  const isCs2 = computed(() => primaryGame.value === 'cs2')
  const isDeadlock = computed(() => primaryGame.value === 'deadlock')

  async function loadFromSettings(): Promise<PrimaryGame> {
    try {
      const settings = await window.api.settings.get()
      primaryGame.value = normalizePrimaryGame(
        settings.primaryGame ?? settings.trainerMouse?.game,
      )
    } catch {
      primaryGame.value = 'valorant'
    }
    loaded = true
    return primaryGame.value
  }

  async function setPrimaryGame(game: PrimaryGame): Promise<void> {
    const current = await window.api.settings.get()
    await window.api.settings.save({
      primaryGame: game,
      trainerMouse: { ...current.trainerMouse, game },
    })
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
    loadFromSettings,
    setPrimaryGame,
    applyFromSettings,
    isLoaded: () => loaded,
  }
}
