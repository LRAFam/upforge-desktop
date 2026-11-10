import { beforeEach, describe, expect, it, vi } from 'vitest'

const recovery = vi.hoisted(() => ({ owner: 1, jobs: [] as Array<{ job_id: string; savedAt: number }> }))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => '/tmp',
    getPath: () => '/tmp',
  },
}))

vi.mock('electron-log', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('./upload-manager', () => ({
  clearPendingJob: vi.fn(),
}))

vi.mock('./user-session', () => ({
  readActivePendingJobs: () => recovery.jobs,
  getActiveUserId: () => recovery.owner,
}))

vi.mock('./analysis-poll', () => ({
  getActiveAnalysisPollJobId: () => null,
}))

import { reconcileStuckAnalysisJobs } from './stuck-analysis-reconciler'
import type { RecordingsStore } from './recordings-store'
import type { UploadManager } from './upload-manager'
import { clearPendingJob } from './upload-manager'

beforeEach(() => { recovery.owner = 1; recovery.jobs = []; vi.clearAllMocks() })

describe('reconcileStuckAnalysisJobs', () => {
  it('checks every persisted orphan and clears only its completed job', async () => {
    recovery.jobs = [{ job_id: 'complete', savedAt: 100 }, { job_id: 'pending', savedAt: 200 }]
    const pollStatus = vi.fn(async (jobId: string) => ({ status: jobId === 'complete' ? 'completed' : 'queued' }))
    const resumePoll = vi.fn()
    await reconcileStuckAnalysisJobs({
      uploadManager: { pollStatus } as unknown as UploadManager,
      recordingsStore: { listStuckAnalysisJobs: () => [], getByJobId: () => null } as unknown as RecordingsStore,
      isAuthenticated: () => true, onCompleted: vi.fn(), onFailed: vi.fn(), resumePoll,
    })
    expect(pollStatus.mock.calls.map(([id]) => id)).toEqual(['complete', 'pending'])
    expect(clearPendingJob).toHaveBeenCalledExactlyOnceWith('complete', 1)
    expect(resumePoll).toHaveBeenCalledWith('pending', expect.any(Object))
  })

  it('ignores an old owners response after account switching', async () => {
    recovery.jobs = [{ job_id: 'old-owner', savedAt: 100 }]
    const onCompleted = vi.fn()
    await reconcileStuckAnalysisJobs({
      uploadManager: { pollStatus: async () => { recovery.owner = 2; return { status: 'completed' } } } as unknown as UploadManager,
      recordingsStore: { listStuckAnalysisJobs: () => [], getByJobId: () => null } as unknown as RecordingsStore,
      isAuthenticated: () => true, onCompleted, onFailed: vi.fn(), resumePoll: vi.fn(),
    })
    expect(clearPendingJob).not.toHaveBeenCalled()
    expect(onCompleted).not.toHaveBeenCalled()
  })
  it('resumes at most one in-flight poll per pass (avoids superseding siblings)', async () => {
    const recordings = [
      {
        id: 'r1',
        jobId: 'job-1',
        agent: 'Jinx',
        map: 'Howling Abyss',
        game: 'lol',
        pipelineStatus: 'analysing' as const,
        analysed: true,
        analysisId: null,
      },
      {
        id: 'r2',
        jobId: 'job-2',
        agent: 'Leona',
        map: 'Howling Abyss',
        game: 'lol',
        pipelineStatus: 'analysing' as const,
        analysed: true,
        analysisId: null,
      },
    ]

    const resumePoll = vi.fn()
    const onCompleted = vi.fn()
    const onFailed = vi.fn()

    const recordingsStore = {
      listStuckAnalysisJobs: () => recordings,
      getByJobId: (jobId: string) => recordings.find((r) => r.jobId === jobId) ?? null,
    } as unknown as RecordingsStore

    const uploadManager = {
      pollStatus: vi.fn(async (jobId: string) => ({
        status: 'processing',
        progress: 98,
        job_id: jobId,
      })),
    } as unknown as UploadManager

    const count = await reconcileStuckAnalysisJobs({
      uploadManager,
      recordingsStore,
      isAuthenticated: () => true,
      fetchRecentAnalyses: async () => [],
      onCompleted,
      onFailed,
      resumePoll,
    })

    expect(count).toBe(0)
    expect(resumePoll).toHaveBeenCalledTimes(1)
    expect(resumePoll).toHaveBeenCalledWith('job-1', expect.objectContaining({ game: 'lol' }))
    expect(onCompleted).not.toHaveBeenCalled()
  })

  it('clears completed stuck jobs using top-level analysis_log_id', async () => {
    const recordings = [
      {
        id: 'r1',
        jobId: 'job-done',
        agent: 'Miks',
        map: 'Ascent',
        game: 'valorant',
        pipelineStatus: 'analysing' as const,
        analysed: true,
        analysisId: null,
      },
    ]

    const onCompleted = vi.fn()
    const resumePoll = vi.fn()

    const recordingsStore = {
      listStuckAnalysisJobs: () => recordings,
      getByJobId: (jobId: string) => recordings.find((r) => r.jobId === jobId) ?? null,
    } as unknown as RecordingsStore

    const uploadManager = {
      pollStatus: vi.fn(async () => ({
        status: 'completed',
        progress: 100,
        analysis_log_id: 518,
        result: { overall_score: 72 },
      })),
    } as unknown as UploadManager

    const count = await reconcileStuckAnalysisJobs({
      uploadManager,
      recordingsStore,
      isAuthenticated: () => true,
      fetchRecentAnalyses: async () => [],
      onCompleted,
      onFailed: vi.fn(),
      resumePoll,
    })

    expect(count).toBe(1)
    expect(resumePoll).not.toHaveBeenCalled()
    expect(onCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-done',
        recordingId: 'r1',
        status: expect.objectContaining({
          status: 'completed',
          analysis_log_id: 518,
        }),
      }),
    )
  })
})
