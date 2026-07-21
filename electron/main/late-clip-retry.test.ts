import { describe, expect, it, vi } from 'vitest'
import { runLateClipRetry } from './late-clip-retry'

describe('runLateClipRetry', () => {
  it('waits for match-time background work to be allowed before retrying', async () => {
    const order: string[] = []
    const deps = {
      waitUntilAllowed: vi.fn(async () => {
        order.push('allowed')
      }),
      retryCs2DemoClips: vi.fn(async () => {
        order.push('retry')
      }),
    }

    await runLateClipRetry(
      {
        game: 'cs2',
        readyPath: 'match.mkv',
        savedRecordingId: 'recording-1',
        timeline: null,
        matchSessionStart: 1,
        matchId: null,
      },
      deps as never,
      { analysisJobId: null },
    )

    expect(order).toEqual(['allowed', 'retry'])
  })

  it('recovers missing matchId via Riot history before fetching details', async () => {
    const timeline = {
      matchId: null as string | null,
      playerKills: [] as unknown[],
      roundSummaries: [] as unknown[],
    }
    const enrichTimelineMatchDetails = vi.fn(async () => {
      timeline.matchId = 'recovered-match-id'
      return true
    })
    const fetchMatchDetailsLate = vi.fn(async () => null)
    const deps = {
      waitUntilAllowed: vi.fn(async () => {}),
      retryCs2DemoClips: vi.fn(),
      riotLocalApi: {
        enrichTimelineMatchDetails,
        fetchMatchDetailsLate,
        populateMatchDataFromDetails: vi.fn(),
        getDiagnostics: () => ({ clientVersion: '1' }),
      },
      recordingsStore: { updateTimeline: vi.fn() },
      mainWindow: { webContents: { send: vi.fn() } },
      extractKillClipsOnly: vi.fn(),
      syncScoutMomentsForJob: vi.fn(),
      enrichTimelineSpatial: vi.fn(),
      finalizeTimelineOffsetsForClips: vi.fn(),
      authManager: { fetchRRHistory: vi.fn(async () => []) },
      settingsManager: { get: () => ({}) },
      uploadManager: { patchMatchData: vi.fn() },
      buildCoachingSubmissionExtras: vi.fn(),
    }

    await runLateClipRetry(
      {
        game: 'valorant',
        readyPath: 'match.mp4',
        savedRecordingId: 'recording-1',
        timeline: timeline as never,
        matchSessionStart: 1,
        matchId: null,
      },
      deps as never,
      { analysisJobId: null },
    )

    expect(enrichTimelineMatchDetails).toHaveBeenCalled()
    expect(fetchMatchDetailsLate).toHaveBeenCalledWith('recovered-match-id')
  })
})
