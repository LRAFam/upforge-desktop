import { describe, expect, it } from 'vitest'
import { decideRiotAccountSwitch } from '../riot-account-switch'

describe('decideRiotAccountSwitch', () => {
  it('activates when in-game matches a non-active linked account', () => {
    expect(decideRiotAccountSwitch({
      inGameName: 'Smurf',
      inGameTag: 'BBB',
      accounts: [
        { id: 1, riot_name: 'Main', riot_tag: 'AAA', is_active: true },
        { id: 2, riot_name: 'Smurf', riot_tag: 'BBB', is_active: false },
      ],
      maxAccounts: 3,
    })).toEqual({ action: 'activate', accountId: 2 })
  })

  it('never auto-links unknown id', () => {
    expect(decideRiotAccountSwitch({
      inGameName: 'Alt',
      inGameTag: 'CCC',
      accounts: [{ id: 1, riot_name: 'Main', riot_tag: 'AAA', is_active: true }],
      maxAccounts: 3,
    }).action).toBe('prompt_link')
  })

  it('prompt_manage when at cap', () => {
    expect(decideRiotAccountSwitch({
      inGameName: 'Alt',
      inGameTag: 'CCC',
      accounts: [{ id: 1, riot_name: 'Main', riot_tag: 'AAA', is_active: true }],
      maxAccounts: 1,
    })).toEqual({ action: 'prompt_manage', name: 'Alt', tag: 'CCC' })
  })

  it('continue when identity unreadable', () => {
    expect(decideRiotAccountSwitch({
      inGameName: null,
      inGameTag: null,
      accounts: [{ id: 1, riot_name: 'Main', riot_tag: 'AAA', is_active: true }],
      maxAccounts: 1,
    })).toEqual({ action: 'continue' })
  })

  it('continues when in-game matches the active linked account', () => {
    expect(decideRiotAccountSwitch({
      inGameName: 'main',
      inGameTag: 'aaa',
      accounts: [{ id: 1, riot_name: 'Main', riot_tag: 'AAA', is_active: true }],
      maxAccounts: 3,
    })).toEqual({ action: 'continue' })
  })
})
