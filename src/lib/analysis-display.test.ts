import { describe, expect, it } from 'vitest'
import {
  analysisCompleteBadge,
  inferAnalysisGame,
  pendingRecordingFailureHint,
} from './analysis-display'
import type { AnalysisItem, PendingRecording } from '../env.d.ts'

describe('analysisCompleteBadge', () => {
  it('shows RR for Valorant', () => {
    expect(analysisCompleteBadge('valorant', 72)).toBe('+144 RR')
  })

  it('shows score out of 100 for CS2 and Deadlock', () => {
    expect(analysisCompleteBadge('cs2', 72)).toBe('72 / 100')
    expect(analysisCompleteBadge('deadlock', 55.4)).toBe('55 / 100')
  })

  it('returns undefined when score missing', () => {
    expect(analysisCompleteBadge('valorant', null)).toBeUndefined()
  })
})

describe('inferAnalysisGame', () => {
  it('detects CS2 from cs2_source', () => {
    const a = { cs2_source: 'steam' } as AnalysisItem
    expect(inferAnalysisGame(a)).toBe('cs2')
  })

  it('detects Deadlock from game_mode', () => {
    const a = { game_mode: 'DEADLOCK' } as AnalysisItem
    expect(inferAnalysisGame(a)).toBe('deadlock')
  })

  it('defaults to Valorant', () => {
    const a = { agent: 'Jett', map: 'Ascent' } as AnalysisItem
    expect(inferAnalysisGame(a)).toBe('valorant')
  })
})

describe('pendingRecordingFailureHint', () => {
  it('suggests Steam demo wait for CS2 demo errors', () => {
    const rec = {
      game: 'cs2',
      lastAnalysisError: 'Demo file not synced yet',
    } as PendingRecording
    expect(pendingRecordingFailureHint(rec)).toMatch(/Steam/)
  })

  it('suggests Riot sync for Valorant late stats', () => {
    const rec = {
      game: 'valorant',
      lastAnalysisError: 'Match stats still syncing',
    } as PendingRecording
    expect(pendingRecordingFailureHint(rec)).toMatch(/Riot/)
  })

  it('prefers server-provided hint', () => {
    const rec = {
      game: 'cs2',
      lastAnalysisError: 'x',
      lastAnalysisErrorHint: 'Custom hint',
    } as PendingRecording
    expect(pendingRecordingFailureHint(rec)).toBe('Custom hint')
  })
})
