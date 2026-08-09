import { describe, expect, it, vi } from 'vitest'

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
  readActivePendingJob: () => null,
}))

vi.mock('./analysis-poll', () => ({
  getActiveAnalysisPollJobId: () => null,
}))

import { reconcileStuckAnalysisJobs } from './stuck-analysis-reconciler'
import type { RecordingsStore } from './recordings-store'
import type { UploadManager } from './upload-manager'

describe('reconcileStuckAnalysisJobs', () => {
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
