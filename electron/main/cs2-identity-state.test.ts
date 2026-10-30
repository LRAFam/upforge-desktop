import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getKnownCs2SteamId, rememberParsedCs2SteamId, resetCs2IdentityState, setCs2SteamIdSaver,
  setKnownCs2Identity, shouldSaveCs2SteamId,
} from './cs2-identity-state'

const ME = '76561197984957085'
const OTHER = '76561198000000001'

beforeEach(() => resetCs2IdentityState())

describe('CS2 Steam ID write-back', () => {
  it('saves the Steam64 after a unique name match from a name the player gave us', () => {
    for (const nameSource of ['override', 'api', 'faceit', 'persona'] as const) {
      expect(shouldSaveCs2SteamId({ parsedSteamId: ME, matchedBy: 'name', nameUnique: true, knownSteamId: null, nameSource })).toBe(true)
    }
  })

  it('never saves from a guess, a clashing name, the account-name fallback, or over a saved id', () => {
    const base = { parsedSteamId: ME, matchedBy: 'name' as const, nameUnique: true, knownSteamId: null, nameSource: 'api' as const }
    expect(shouldSaveCs2SteamId({ ...base, matchedBy: 'inferred' })).toBe(false)
    expect(shouldSaveCs2SteamId({ ...base, nameUnique: false })).toBe(false)
    expect(shouldSaveCs2SteamId({ ...base, nameSource: 'account' })).toBe(false)
    expect(shouldSaveCs2SteamId({ ...base, knownSteamId: OTHER })).toBe(false)
    expect(shouldSaveCs2SteamId({ ...base, parsedSteamId: '12345' })).toBe(false)
  })

  it('remembers once, then prefers the saved id', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    setCs2SteamIdSaver(save)
    setKnownCs2Identity(null, 'faceit')
    expect(rememberParsedCs2SteamId(ME, 'name', true)).toBe(true)
    expect(rememberParsedCs2SteamId(ME, 'name', true)).toBe(false)
    expect(save).toHaveBeenCalledExactlyOnceWith(ME)
    expect(getKnownCs2SteamId()).toBe(ME)
  })

  it('ignores a saved value that is not a Steam64', () => {
    setKnownCs2Identity('rook', 'api')
    expect(getKnownCs2SteamId()).toBeNull()
  })
})
