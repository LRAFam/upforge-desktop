import { describe, expect, it, vi } from 'vitest'
import { emptyMatchData } from './recording-sync'
import { resendMatchDataForRetry, type RetryMatchDataDeps } from './retry-match-data'
import type { MatchData } from './riot-types'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => process.cwd() } }))

function sparseTimeline(): MatchData {
  return { ...emptyMatchData('valorant', 0), matchId: 'match-1' }
}

function deps(over: Partial<RetryMatchDataDeps> = {}): RetryMatchDataDeps {
  return {
    fetchMatchDetails: vi.fn().mockResolvedValue({ players: [] }),
    populateFromDetails: vi.fn((t: MatchData) => {
      t.finalStats = { kills: 18, deaths: 13, assists: 4 } as MatchData['finalStats']
    }),
    patchMatchData: vi.fn().mockResolvedValue(undefined),
    saveTimeline: vi.fn(),
    ...over,
  }
}

describe('resendMatchDataForRetry (prod job a1dffbb6)', () => {
  it('refetches Riot stats and sends them to the retried job', async () => {
    const d = deps()
    const t = sparseTimeline()
    expect(await resendMatchDataForRetry('job-1', t, d)).toBe('refetched')
    expect(d.fetchMatchDetails).toHaveBeenCalledWith('match-1')
    expect(t.matchDetails).toEqual({ players: [] })
    expect(d.saveTimeline).toHaveBeenCalledWith(t)
    expect(d.patchMatchData).toHaveBeenCalledWith('job-1', t)
  })

  it('falls back to the saved timeline when Riot is unavailable', async () => {
    const d = deps({ fetchMatchDetails: vi.fn().mockRejectedValue(new Error('no auth')) })
    const t = sparseTimeline()
    t.playerKills = [{ round: 1 }] as MatchData['playerKills']
    expect(await resendMatchDataForRetry('job-1', t, d)).toBe('saved_timeline')
    expect(d.patchMatchData).toHaveBeenCalledWith('job-1', t)
  })

  it('sends nothing when neither Riot nor the saved timeline has stats', async () => {
    const d = deps({ fetchMatchDetails: vi.fn().mockResolvedValue(null) })
    expect(await resendMatchDataForRetry('job-1', sparseTimeline(), d)).toBe('no_match_data')
    expect(await resendMatchDataForRetry('job-1', null, d)).toBe('no_match_data')
    expect(d.patchMatchData).not.toHaveBeenCalled()
  })
})
