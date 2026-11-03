import { computed, ref, watch, type Ref } from 'vue'

/**
 * The Home focus note comes from HomeFocusPanel, which only mounts for Valorant. Its last answer
 * is tied to the game it was given for: switching game clears it, and it is never read on
 * another game (a Valorant Reyna note must not show on CS2).
 */
export function useGameScopedFocus<T>(game: Ref<string>) {
  const stored = ref<{ game: string; latest: T | null } | null>(null) as Ref<{ game: string; latest: T | null } | null>
  watch(game, () => { stored.value = null })
  const current = computed(() => (stored.value && stored.value.game === game.value ? stored.value : null))
  return {
    /** Latest focus update for the selected game, or null. */
    latest: computed<T | null>(() => current.value?.latest ?? null),
    /** The panel has answered at least once for the selected game. */
    answered: computed(() => current.value !== null),
    set(latest: T | null) { stored.value = { game: game.value, latest } },
  }
}
