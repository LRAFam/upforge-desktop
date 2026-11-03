import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useGameScopedFocus } from './use-game-focus'

describe('useGameScopedFocus', () => {
  it('clears the focus note when the game changes', async () => {
    const game = ref('valorant')
    const focus = useGameScopedFocus<{ note: string }>(game)
    focus.set({ note: 'Reyna: dismiss into cover' })
    expect(focus.latest.value).toEqual({ note: 'Reyna: dismiss into cover' })
    expect(focus.answered.value).toBe(true)

    game.value = 'cs2'
    // Synchronously wrong-game data is already hidden, before the watcher runs.
    expect(focus.latest.value).toBeNull()
    await nextTick()
    expect(focus.answered.value).toBe(false)

    // Back on Valorant the panel must answer again (it remounts); the old note stays gone.
    game.value = 'valorant'
    await nextTick()
    expect(focus.latest.value).toBeNull()
    expect(focus.answered.value).toBe(false)
  })
})
