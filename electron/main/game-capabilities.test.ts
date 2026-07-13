import { describe, expect, it } from 'vitest'
import {
  gameNeedsLiveMatchWindow,
  uploadsSourceReplay,
  usesDemoReplay,
  usesLiveClientTimeline,
} from './game-capabilities'

describe('game-capabilities', () => {
  it('classifies demo-replay games', () => {
    expect(usesDemoReplay('cs2')).toBe(true)
    expect(usesDemoReplay('deadlock')).toBe(true)
    expect(usesDemoReplay('valorant')).toBe(false)
    expect(usesDemoReplay('lol')).toBe(false)
  })

  it('classifies live-client timeline games', () => {
    expect(usesLiveClientTimeline('valorant')).toBe(true)
    expect(usesLiveClientTimeline('lol')).toBe(true)
    expect(usesLiveClientTimeline('cs2')).toBe(false)
  })

  it('knows which games need a live match window', () => {
    expect(gameNeedsLiveMatchWindow('lol')).toBe(true)
    expect(gameNeedsLiveMatchWindow('cs2')).toBe(true)
    expect(gameNeedsLiveMatchWindow('valorant')).toBe(false)
  })

  it('knows which games upload source replays', () => {
    expect(uploadsSourceReplay('cs2')).toBe(true)
    expect(uploadsSourceReplay('lol')).toBe(false)
  })
})
