import { describe, expect, it } from 'vitest'
import {
  GAME_IDS,
  gameLabel,
  gameSupportsRounds,
  idleTooltip,
  normalizeGameId,
  obsCaptureConfig,
  resolveGameMode,
} from './game-config'
import { resolveLolMapLabel } from '../../src/lib/lol-maps'

describe('normalizeGameId', () => {
  it('passes through known games', () => {
    expect(normalizeGameId('lol')).toBe('lol')
    expect(normalizeGameId('cs2')).toBe('cs2')
    expect(normalizeGameId('deadlock')).toBe('deadlock')
    expect(normalizeGameId('valorant')).toBe('valorant')
  })

  it('defaults unknown/empty values to valorant', () => {
    expect(normalizeGameId('overwatch')).toBe('valorant')
    expect(normalizeGameId(null)).toBe('valorant')
    expect(normalizeGameId(undefined)).toBe('valorant')
  })
})

describe('gameLabel / idleTooltip', () => {
  it('returns readable labels', () => {
    expect(gameLabel('lol')).toBe('League of Legends')
    expect(gameLabel('cs2')).toBe('CS2')
    expect(gameLabel('unknown')).toBe('Valorant')
    expect(idleTooltip('lol')).toBe('UpForge — League of Legends AI Coaching')
  })
})

describe('gameSupportsRounds', () => {
  it('is true for round-based games only', () => {
    expect(gameSupportsRounds('valorant')).toBe(true)
    expect(gameSupportsRounds('cs2')).toBe(true)
    expect(gameSupportsRounds('lol')).toBe(false)
    expect(gameSupportsRounds('deadlock')).toBe(false)
  })
})

describe('resolveGameMode', () => {
  it('prefers the Valorant live mode, then timeline, then default', () => {
    expect(resolveGameMode('valorant', { valorantLiveMode: 'SWIFTPLAY' })).toBe('SWIFTPLAY')
    expect(resolveGameMode('valorant', { timelineMode: 'COMPETITIVE' })).toBe('COMPETITIVE')
    expect(resolveGameMode('valorant', {})).toBe('UNKNOWN')
  })

  it('uses the timeline mode then per-game default for other games', () => {
    expect(resolveGameMode('lol', { timelineMode: 'ARAM' })).toBe('ARAM')
    expect(resolveGameMode('lol', {})).toBe('RANKED_SOLO')
    expect(resolveGameMode('cs2', {})).toBe('COMPETITIVE')
    // A stray Valorant live mode must never leak onto a LoL recording.
    expect(resolveGameMode('lol', { valorantLiveMode: 'SWIFTPLAY' })).toBe('RANKED_SOLO')
  })
})

describe('obsCaptureConfig', () => {
  it('uses game capture for Valorant', () => {
    expect(obsCaptureConfig('valorant').useWindowCapture).toBe(false)
  })

  it('uses window capture for hook-blocked games', () => {
    expect(obsCaptureConfig('cs2').useWindowCapture).toBe(true)
    expect(obsCaptureConfig('deadlock').useWindowCapture).toBe(true)
    expect(obsCaptureConfig('lol').useWindowCapture).toBe(true)
  })

  it('forces WGC (method 2) for League to dodge the Vanguard black screen', () => {
    expect(obsCaptureConfig('lol').windowCaptureMethod).toBe(2)
    expect(obsCaptureConfig('cs2').windowCaptureMethod).toBe(0)
  })
})

describe('resolveLolMapLabel (shared)', () => {
  it('maps Riot codenames to readable names', () => {
    expect(resolveLolMapLabel('Map11')).toBe("Summoner's Rift")
    expect(resolveLolMapLabel('Map12')).toBe('Howling Abyss')
    expect(resolveLolMapLabel('Map99')).toBe("Summoner's Rift")
  })
})

describe('GAME_IDS', () => {
  it('lists every supported game', () => {
    expect(GAME_IDS).toEqual(['valorant', 'cs2', 'deadlock', 'lol'])
  })
})
