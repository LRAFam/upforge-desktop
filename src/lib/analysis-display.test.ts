import { describe, expect, it } from 'vitest'
import {
  analysisCompleteBadge,
  filterAnalysesForPrimaryGame,
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
    const a = { cs2_source: 'demo_upload' } as AnalysisItem
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

describe('filterAnalysesForPrimaryGame', () => {
  const valorant = { id: 1, agent: 'Jett', map: 'Ascent' } as AnalysisItem
  const cs2 = { id: 2, map: 'DE_VERTIGO', cs2_source: 'demo_upload' } as AnalysisItem
  const deadlock = { id: 3, game_mode: 'DEADLOCK', map: 'Street' } as AnalysisItem

  it('keeps only the selected game after a tab switch leaves mixed rows', () => {
    const mixed = [valorant, cs2, deadlock]
    expect(filterAnalysesForPrimaryGame(mixed, 'valorant').map(a => a.id)).toEqual([1])
    expect(filterAnalysesForPrimaryGame(mixed, 'cs2').map(a => a.id)).toEqual([2])
    expect(filterAnalysesForPrimaryGame(mixed, 'deadlock').map(a => a.id)).toEqual([3])
  })

  it('drops CS2 map rows when Valorant is selected', () => {
    const staleCs2 = { id: 9, map: 'DE_DUST2', agent: 'HooXi' } as AnalysisItem
    expect(filterAnalysesForPrimaryGame([staleCs2], 'valorant')).toEqual([])
  })
})

describe('pendingRecordingFailureHint', () => {
  it('suggests attaching the replay for CS2 demo errors', () => {
    const rec = {
      game: 'cs2',
      lastAnalysisError: 'Demo file not synced yet',
    } as PendingRecording
    expect(pendingRecordingFailureHint(rec)).toMatch(/replay|\.dem/i)
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
