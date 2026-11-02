import { describe, expect, it } from 'vitest'
import { coachingSkipMessage, coachingSkipNeedsDiscord } from './coaching-preferences'

describe('coaching skip message', () => {
  it('points an unlinked user to Settings › Account', () => {
    expect(coachingSkipMessage('discord_not_linked')).toBe('Link Discord in Settings › Account to receive pre-game briefs.')
    expect(coachingSkipNeedsDiscord('discord_not_linked')).toBe(true)
  })

  it('offers no Discord link for other skip reasons', () => {
    for (const r of ['disabled', 'cooldown', 'delivery_failed', undefined]) expect(coachingSkipNeedsDiscord(r)).toBe(false)
  })
})
