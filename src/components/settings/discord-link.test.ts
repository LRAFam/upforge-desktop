import { describe, expect, it } from 'vitest'
import { DISCORD_LINK_ROUTE, DISCORD_WAIT_MS, linkedDiscordName, stillWaiting } from './discord-link'
import { resolveSettingsCategory, resolveSettingsSection } from '../../lib/settings-nav'

describe('linkedDiscordName', () => {
  it('reads discord_username and treats blanks as not linked', () => {
    expect(linkedDiscordName({ discord_username: ' adam ' })).toBe('adam')
    expect(linkedDiscordName({ discord_username: '' })).toBeNull()
    expect(linkedDiscordName({ discord_username: null })).toBeNull()
    expect(linkedDiscordName(null)).toBeNull()
  })
})

describe('DISCORD_LINK_ROUTE', () => {
  it('lands on Settings › Account and highlights the Discord row', () => {
    expect(resolveSettingsCategory(DISCORD_LINK_ROUTE.query.tab)).toBe('account')
    expect(resolveSettingsSection(DISCORD_LINK_ROUTE.query.section)).toBe('discord-link')
  })
})

describe('stillWaiting', () => {
  it('waits a few minutes after starting the link, then stops', () => {
    expect(stillWaiting(null, 0)).toBe(false)
    expect(stillWaiting(1000, 1000 + DISCORD_WAIT_MS - 1)).toBe(true)
    expect(stillWaiting(1000, 1000 + DISCORD_WAIT_MS)).toBe(false)
  })
})
