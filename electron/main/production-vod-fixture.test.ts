import { describe, expect, it, vi } from 'vitest'
import type { AuthManager } from './auth-manager'
import { parseProductionArchiveSummary, ProductionVodFixtureLibrary } from './production-vod-fixture'

describe('production VOD fixture contract', () => {
  it('accepts the explicit archive summary contract', () => {
    expect(parseProductionArchiveSummary({
      archive_id: 'archive-1',
      analysis_state: 'not_analysed',
      analysis_id: null,
      analysis_job_id: null,
      game: 'valorant',
      map: 'Haven',
      agent: 'Jett',
      game_mode: 'competitive',
      match_id: 'match-1',
      file_size_bytes: 123,
      archived_at: '2026-08-21T12:00:00Z',
      retention_expires_at: null,
      has_match_data: true,
    })).toMatchObject({
      archive_id: 'archive-1',
      analysis_state: 'not_analysed',
      game_mode: 'competitive',
    })
  })

  it('rejects missing canonical fields instead of guessing', () => {
    expect(() => parseProductionArchiveSummary({
      archive_id: 'archive-1',
      analysis_state: 'not_analysed',
      game: 'valorant',
      has_match_data: false,
    })).toThrow('analysis_id')
  })

  it('rejects unknown analysis states', () => {
    expect(() => parseProductionArchiveSummary({
      archive_id: 'archive-1',
      analysis_state: 'complete-ish',
      analysis_id: null,
      analysis_job_id: null,
      game: 'valorant',
      map: null,
      agent: null,
      game_mode: null,
      match_id: null,
      file_size_bytes: null,
      archived_at: null,
      retention_expires_at: null,
      has_match_data: false,
    })).toThrow('analysis_state')
  })

  it('mounts archive detail as a session-only read-only recording', async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        source: 'production_archive',
        archive: {
          archive_id: 'archive-1',
          analysis_state: 'analysed',
          analysis_id: 42,
          analysis_job_id: 'job-1',
          game: 'valorant',
          map: 'Haven',
          agent: 'Jett',
          game_mode: 'competitive',
          match_id: 'match-1',
          file_size_bytes: 123,
          archived_at: '2026-08-21T12:00:00Z',
          retention_expires_at: null,
          has_match_data: true,
          match_data: { matchId: 'match-1', playerKills: [] },
        },
      },
    })
    const auth = { getApi: () => ({ get }) } as unknown as AuthManager
    const library = new ProductionVodFixtureLibrary()

    const fixture = await library.mount(auth, 'archive-1')

    expect(fixture).toMatchObject({
      id: 'production-fixture:archive-1',
      analysed: false,
      archiveId: 'archive-1',
      cloudArchived: true,
      productionFixture: {
        source: 'production_archive',
        readOnly: true,
        analysisState: 'analysed',
        missingFields: [],
      },
    })
    expect(library.getActive()).toBe(fixture)
    expect(library.unmount(fixture.id)).toBe(true)
    expect(library.getActive()).toBeNull()
  })
})
