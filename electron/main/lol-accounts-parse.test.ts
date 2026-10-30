import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, safeStorage: { isEncryptionAvailable: () => false } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { parseLolAccounts } from './auth-manager'

describe('parseLolAccounts', () => {
  it('keeps well-formed League accounts and drops the rest', () => {
    const rows = parseLolAccounts([
      { id: 1, riot_name: 'Main', riot_tag: 'EUW', platform: 'EUW1', is_main: true, verified: true },
      { id: 2, riot_name: 'Alt', riot_tag: 'EUW', platform: 'EUW1', is_main: false, verified: false },
      { id: 'x', riot_name: 'Bad' },
      null,
    ])
    expect(rows.map(r => r.riot_name)).toEqual(['Main', 'Alt'])
    expect(rows[0].is_main).toBe(true)
    expect(rows[1].verified).toBe(false)
  })

  it('returns an empty list for anything that is not a list', () => {
    expect(parseLolAccounts(undefined)).toEqual([])
    expect(parseLolAccounts({ accounts: [] })).toEqual([])
  })
})
