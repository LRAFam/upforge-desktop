import { computed } from 'vue'
import { usePrimaryGame } from './usePrimaryGame'
import { gameTheme, gameThemeCssVars } from '../lib/game-themes'
import { gameModule, type GameModule } from '../lib/game-modules'

export function useGameTheme() {
  const { primaryGame, isValorant, isCs2, isDeadlock } = usePrimaryGame()

  const theme = computed(() => gameTheme(primaryGame.value))
  const module = computed<GameModule>(() => gameModule(primaryGame.value))
  const cssVars = computed(() => gameThemeCssVars(theme.value))
  const features = computed(() => module.value.features)

  return {
    primaryGame,
    isValorant,
    isCs2,
    isDeadlock,
    theme,
    module,
    cssVars,
    features,
  }
}
