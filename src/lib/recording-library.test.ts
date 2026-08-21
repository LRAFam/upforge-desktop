import { describe, expect, it } from 'vitest'
import {
  groupRecordingsByDate,
  matchesRecordingLibraryChip,
  recordingDeleteOptions,
  recordingHasCloudCopy,
  recordingNeedsAttention,
  recordingNeedsUserAction,
  visibleGroupItems,
  formatRecordingBytes,
} from './recording-library'
import type { PendingRecording } from '../env.d.ts'

function rec(overrides: Partial<PendingRecording> = {}): PendingRecording {
  return {
    id: '1',
    path: '/tmp/a.mp4',
    game: 'valorant',
    map: 'Breeze',
    agent: 'Jett',
    gameMode: 'COMPETITIVE',
    recordedAt: Date.now(),
    analysed: false,
    hasLocalFile: true,
    cloudUploaded: false,
    ...overrides,
  } as PendingRecording
}

describe('recordingNeedsAttention', () => {
  it('flags only sessions where the user can take a useful action', () => {
    expect(recordingNeedsAttention(rec({ lastAnalysisError: 'x' }))).toBe(true)
    expect(
      recordingNeedsAttention(
        rec({ analysisReadiness: { ready: true, state: 'ready', message: '', duelMomentCount: 1 } }),
      ),
    ).toBe(true)
    expect(recordingNeedsAttention(rec({
      matchStatsSyncPaused: true,
      analysisReadiness: { ready: false, state: 'waiting_match_data', message: '', duelMomentCount: 0 },
    }))).toBe(true)
    expect(recordingNeedsAttention(rec({
      analysisReadiness: { ready: false, state: 'finalizing', message: '', duelMomentCount: 0 },
    }))).toBe(false)
    expect(recordingNeedsAttention(rec({ clipsOnly: true }))).toBe(false)
    expect(recordingNeedsUserAction(rec({ pipelineStatus: 'analysing', lastAnalysisError: 'old' }))).toBe(false)
  })
})

describe('matchesRecordingLibraryChip', () => {
  it('filters by chip', () => {
    const analysed = rec({ analysisId: 9 })
    const cloud = rec({ cloudUploaded: true, analysisId: undefined })
    const ready = rec({
      analysisId: undefined,
      pipelineStatus: undefined,
      analysisReadiness: { ready: true, state: 'ready', message: '', duelMomentCount: 1 },
    })
    expect(matchesRecordingLibraryChip(analysed, 'analysed')).toBe(true)
    expect(matchesRecordingLibraryChip(cloud, 'cloud')).toBe(true)
    expect(matchesRecordingLibraryChip(ready, 'ready')).toBe(true)
    expect(matchesRecordingLibraryChip(ready, 'action_required')).toBe(true)
  })
})

describe('groupRecordingsByDate', () => {
  it('buckets like Clips and omits empty groups', () => {
    const now = Date.parse('2026-08-09T15:00:00Z')
    const today = rec({ id: 't', recordedAt: Date.parse('2026-08-09T12:00:00Z') })
    const older = rec({ id: 'o', recordedAt: Date.parse('2026-06-01T12:00:00Z') })
    const groups = groupRecordingsByDate([today, older], now)
    expect(groups.map(g => g.label)).toEqual(['Today', 'Older'])
    expect(groups[0]!.items[0]!.id).toBe('t')
  })
})

describe('visibleGroupItems', () => {
  it('paginates when collapsed past limit', () => {
    const items = Array.from({ length: 15 }, (_, i) => i)
    expect(visibleGroupItems(items, true, 12).shown).toHaveLength(15)
    expect(visibleGroupItems(items, false, 12).shown).toHaveLength(12)
    expect(visibleGroupItems(items, false, 12).hiddenCount).toBe(3)
  })
})

describe('recordingHasCloudCopy', () => {
  it('matches main hasCloudRecording predicate', () => {
    expect(recordingHasCloudCopy(rec({ jobId: 'j1' }))).toBe(true)
    expect(recordingHasCloudCopy(rec({ analysisId: 9 }))).toBe(true)
    expect(recordingHasCloudCopy(rec({ cloudArchived: true, archiveId: 'a1' }))).toBe(true)
    expect(recordingHasCloudCopy(rec({ archiveId: 'a1' }))).toBe(false)
    expect(recordingHasCloudCopy(rec({ cloudUploaded: true }))).toBe(false)
    expect(recordingHasCloudCopy(rec({ clipsOnly: true, jobId: 'j1' }))).toBe(false)
  })
})

describe('recordingDeleteOptions', () => {
  it('offers localOnly only when cloud-backed with local file', () => {
    expect(recordingDeleteOptions(rec({ hasLocalFile: true, cloudUploaded: false }))).toEqual(['remove'])
    expect(recordingDeleteOptions(rec({ hasLocalFile: true, jobId: 'j1' }))).toEqual(['remove', 'localOnly'])
    expect(recordingDeleteOptions(rec({ hasLocalFile: true, analysisId: 9 }))).toEqual(['remove', 'localOnly'])
    expect(
      recordingDeleteOptions(rec({ hasLocalFile: true, cloudArchived: true, archiveId: 'a1' })),
    ).toEqual(['remove', 'localOnly'])
    expect(recordingDeleteOptions(rec({ hasLocalFile: true, archiveId: 'a1' }))).toEqual(['remove'])
    expect(
      recordingDeleteOptions(rec({ hasLocalFile: true, cloudUploaded: true, archiveId: 'a1' })),
    ).toEqual(['remove'])
    expect(
      recordingDeleteOptions(rec({ hasLocalFile: false, cloudUploaded: true, path: '' })),
    ).toEqual(['remove'])
  })
})

describe('formatRecordingBytes', () => {
  it('formats MB/GB', () => {
    expect(formatRecordingBytes(0)).toBe('0 B')
    expect(formatRecordingBytes(5 * 1024 * 1024)).toMatch(/MB/)
    expect(formatRecordingBytes(1.2 * 1024 * 1024 * 1024)).toMatch(/GB/)
  })
})
