import { describe, expect, it } from 'vitest'
import { decideRiotAccountSwitch, riotSwitchNotice } from '../riot-account-switch'

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

describe('riotSwitchNotice', () => {
  const accounts = [{ id: 1, riot_name: 'Typo', riot_tag: 'EUW', is_active: true }]

  it('records a mistyped / new Riot ID and offers the link prompt instead of skipping', () => {
    const decision = decideRiotAccountSwitch({ inGameName: 'Real', inGameTag: 'EUW', accounts, maxAccounts: 1 })
    expect(decision.action).toBe('prompt_manage')
    const notice = riotSwitchNotice(decision)!
    expect(notice.message).toMatch(/^Recording this match\./)
    expect(notice.prompt).toEqual({ name: 'Real', tag: 'EUW', atCap: true })
  })

  it('offers a link with a free slot, says so when switching fails, and stays quiet otherwise', () => {
    const link = riotSwitchNotice(decideRiotAccountSwitch({ inGameName: 'Alt', inGameTag: 'EUW', accounts, maxAccounts: 3 }))!
    expect(link.prompt).toEqual({ name: 'Alt', tag: 'EUW', atCap: false })
    expect(link.message).toMatch(/^Recording this match\./)
    expect(riotSwitchNotice({ action: 'activate', accountId: 2 }, true)).toMatchObject({ prompt: null, message: expect.stringMatching(/^Recording this match/) })
    expect(riotSwitchNotice({ action: 'activate', accountId: 2 })).toBeNull()
    expect(riotSwitchNotice({ action: 'continue' })).toBeNull()
  })
})
