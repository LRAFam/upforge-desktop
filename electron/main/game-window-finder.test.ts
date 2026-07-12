import { describe, expect, it } from 'vitest'
import { OBS_WINDOW_FALLBACKS, resolveObsCaptureWindow } from './game-window-finder'

describe('OBS window fallbacks', () => {
  it('has a dedicated League of Legends window string', () => {
    expect(OBS_WINDOW_FALLBACKS.lol).toBeTruthy()
    expect(OBS_WINDOW_FALLBACKS.lol).toContain('League of Legends.exe')
    expect(OBS_WINDOW_FALLBACKS.lol).not.toEqual(OBS_WINDOW_FALLBACKS.valorant)
  })

  it('does not resolve LoL to the Valorant capture window', async () => {
    // On non-Windows (CI/dev) this returns the static fallback, not the Valorant one.
    const resolved = await resolveObsCaptureWindow('lol')
    expect(resolved).toContain('League of Legends')
    expect(resolved).not.toContain('VALORANT')
  })
})
