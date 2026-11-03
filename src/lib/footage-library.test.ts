import { describe, expect, it } from 'vitest'
import { mergeFootage, footageSource, footageUnavailable } from './footage-library'
import type { CloudFile } from './cloud-storage'
import type { PendingRecording } from '../env.d'
const file: CloudFile = { id: 'archive-1', kind: 'recording', game: 'valorant', agent: 'Fade', map: 'Summit', title: null, status: 'archived', created_at: '2026-09-01T00:00:00Z', expires_at: '2026-09-10T00:00:00Z', bytes: 100 }
const local: PendingRecording = { id: 'local-1', archiveId: file.id, path: '/recording.mp4', game: 'valorant', map: 'Summit', agent: 'Fade', gameMode: '', recordedAt: 1, analysed: false, hasLocalFile: true }
describe('one footage library', () => {
  it('joins only by archive identity and keeps the local review source', () => {
    const rows = mergeFootage([local], [file, { ...file, id: 'other-archive' }])
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.id === local.id)?.path).toBe(local.path)
    expect(rows.find(r => r.cloudOnly)?.agent).toBe('Fade')
  })
  it('keeps expired footage visible without blocking a device copy', () => {
    const now = Date.parse('2026-09-29')
    expect(footageUnavailable(mergeFootage([], [file])[0], now)).toBe('Retention ended')
    expect(footageUnavailable(mergeFootage([local], [file])[0], now)).toBeNull()
  })
  it('does not invent a game for legacy cloud metadata', () => {
    expect(mergeFootage([], [{ ...file, game: undefined }])[0].game).toBe('unknown')
  })
  it('cloud retention: removed video says so, analysed matches still open, this PC copy wins', () => {
    const removed = { ...file, retention: { state: 'removed', video_stored: false } }
    expect(footageUnavailable(mergeFootage([], [removed])[0])).toBe('Full video no longer stored')
    expect(footageSource(mergeFootage([], [removed])[0])).toBe('none')
    expect(footageUnavailable(mergeFootage([], [{ ...removed, analysis_id: 9 }])[0])).toBeNull()
    expect(footageSource(mergeFootage([local], [removed])[0])).toBe('local')
    expect(footageUnavailable(mergeFootage([local], [removed])[0])).toBeNull()
  })
  it('cloud retention: a countdown video still plays from the cloud, ignoring the old expiry date', () => {
    const countdown = { ...file, retention: { state: 'countdown', days_left: 3, video_stored: true } }
    expect(footageUnavailable(mergeFootage([], [countdown])[0], Date.parse('2026-09-29'))).toBeNull()
    expect(footageSource(mergeFootage([], [countdown])[0])).toBe('cloud')
  })
})
