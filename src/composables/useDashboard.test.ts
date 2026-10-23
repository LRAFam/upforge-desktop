import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import type { PendingRecording, ProfileData } from '../env'
import { provideDashboard } from './useDashboard'

vi.mock('vue', async (importOriginal) => ({
  ...await importOriginal<typeof import('vue')>(),
  onMounted: vi.fn(),
  onUnmounted: vi.fn(),
  provide: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../lib/game-modules', () => ({
  invalidateGameAnalysesCache: vi.fn(),
  loadGameAnalyses: vi.fn(),
  openGameHistoryWeb: vi.fn(),
  openGameAnalyze: vi.fn(),
}))

describe('dashboard upload recovery at the credit limit', () => {
  const analyse = vi.fn()
  let scope: ReturnType<typeof effectScope>
  let dashboard: ReturnType<typeof provideDashboard>

  beforeEach(() => {
    vi.useFakeTimers()
    analyse.mockReset().mockResolvedValue({ ok: true })
    vi.stubGlobal('localStorage', { getItem: () => null })
    vi.stubGlobal('window', { api: { recordings: { analyse, get: vi.fn().mockResolvedValue([]) } } })
    scope = effectScope()
    dashboard = scope.run(() => provideDashboard())!
    dashboard.profile.value = {
      user: { tier: 'free', is_admin: false, analysis_stats: { total: 1, limit: 1, purchased: 0 } },
    } as ProfileData
  })

  afterEach(() => {
    scope.stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function setRecording(overrides: Partial<PendingRecording> = {}) {
    const recording: PendingRecording = {
      id: 'interrupted-recording', path: '/recording.mp4', game: 'valorant',
      map: 'Ascent', agent: 'Jett', gameMode: 'competitive', recordedAt: 1, analysed: false,
      analysisReadiness: { ready: true, state: 'ready', message: '', duelMomentCount: 5 },
      ...overrides,
    }
    dashboard.pendingRecordings.value = [recording]
    return recording
  }

  it.each([undefined, 'reserved-job'])('resumes an interrupted upload with job ID %s and no spare credit', async (jobId) => {
    const rec = setRecording({ jobId, lastAnalysisError: 'Connection lost', lastFailureCode: 'upload_network' })
    expect(dashboard.recAnalysisActionLabel(rec)).toBe('Resume Upload')
    await dashboard.retryRecording(rec.id)
    expect(analyse).toHaveBeenCalledWith(rec.id)
    expect(dashboard.upgradeNeeded.value).toBe(false)
  })

  it('resumes older recordings classified by their network error', async () => {
    const rec = setRecording({ lastAnalysisError: 'socket hang up' })
    await dashboard.retryRecording(rec.id)
    expect(analyse).toHaveBeenCalledWith(rec.id)
  })

  it.each([
    {},
    { jobId: 'failed-job', lastAnalysisError: 'Analysis failed', lastFailureCode: 'analysis_failed' },
    { lastAnalysisError: 'Preparation failed', lastFailureCode: 'preparation_failed' },
  ])('keeps the credit check for a new analysis or a non-upload failure: %j', async (failure) => {
    const rec = setRecording(failure)
    await dashboard.analyseRecording(rec.id)
    expect(analyse).not.toHaveBeenCalled()
    expect(dashboard.upgradeNeeded.value).toBe(true)
  })

  it('shows a server rejection when the upload can no longer reuse its reservation', async () => {
    analyse.mockResolvedValue({ error: 'No analysis credits remaining' })
    const rec = setRecording({ lastAnalysisError: 'Connection lost', lastFailureCode: 'upload_network' })
    await dashboard.retryRecording(rec.id)
    expect(analyse).toHaveBeenCalledWith(rec.id)
    expect(dashboard.warning.value).toBe('No analysis credits remaining')
    expect(dashboard.analysingIds.value.has(rec.id)).toBe(false)
  })
})
