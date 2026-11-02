import { describe, expect, it } from 'vitest'
import { playerAvatarArt, playerCardSmallArt, playerRankLine } from './player-art'

describe('player-art', () => {
  it('prefers the player card, then the agent portrait, else null', () => {
    const card = 'a438763c-4720-5d58-0aa9-8c89578bc0ae'
    expect(playerAvatarArt({ playerCardId: card, agent: 'Jett' })).toEqual({
      src: `https://media.valorant-api.com/playercards/${card}/smallart.png`, kind: 'card',
    })
    expect(playerAvatarArt({ playerCardId: null, agent: 'Jett' })?.kind).toBe('agent')
    expect(playerAvatarArt({ agent: 'NotAnAgent' })).toBeNull()
    expect(playerAvatarArt(null)).toBeNull()
  })

  it('rejects card ids that are not uuids', () => {
    expect(playerCardSmallArt('../evil')).toBeNull()
    expect(playerCardSmallArt('')).toBeNull()
  })

  it('joins rank and agent, with the rank icon when the rank is known', () => {
    const line = playerRankLine('Platinum 2', 'Jett')
    expect(line?.text).toBe('Platinum 2 · Jett')
    expect(line?.icon).toContain('/16/smallicon.png')
    expect(playerRankLine(null, 'Reyna')).toEqual({ text: 'Reyna', icon: null })
    expect(playerRankLine(null, null)).toBeNull()
  })
})
