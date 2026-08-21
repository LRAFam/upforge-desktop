import type { AuthManager } from './auth-manager'
import type { MatchData } from './riot-local-api'
import type { PendingRecording } from './recordings-store'

export type ProductionArchiveAnalysisState =
  | 'not_analysed'
  | 'queued'
  | 'analysing'
  | 'failed'
  | 'analysed'

export interface ProductionArchiveSummary {
  archive_id: string
  analysis_state: ProductionArchiveAnalysisState
  analysis_id: number | null
  analysis_job_id: string | null
  game: string
  map: string | null
  agent: string | null
  game_mode: string | null
  match_id: string | null
  file_size_bytes: number | null
  archived_at: string | null
  retention_expires_at: string | null
  has_match_data: boolean
}

interface ProductionArchiveDetail extends ProductionArchiveSummary {
  match_data: Record<string, unknown> | null
}

const ANALYSIS_STATES = new Set<ProductionArchiveAnalysisState>([
  'not_analysed',
  'queued',
  'analysing',
  'failed',
  'analysed',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new Error(`Production archive field ${field} is invalid`)
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  throw new Error(`Production archive field ${field} is invalid`)
}

export function parseProductionArchiveSummary(value: unknown): ProductionArchiveSummary {
  if (!isRecord(value)) throw new Error('Production archive item is invalid')
  if (typeof value.archive_id !== 'string' || !value.archive_id) {
    throw new Error('Production archive field archive_id is invalid')
  }
  if (typeof value.analysis_state !== 'string' || !ANALYSIS_STATES.has(value.analysis_state as ProductionArchiveAnalysisState)) {
    throw new Error('Production archive field analysis_state is invalid')
  }
  if (typeof value.game !== 'string' || !value.game) {
    throw new Error('Production archive field game is invalid')
  }
  if (typeof value.has_match_data !== 'boolean') {
    throw new Error('Production archive field has_match_data is invalid')
  }

  return {
    archive_id: value.archive_id,
    analysis_state: value.analysis_state as ProductionArchiveAnalysisState,
    analysis_id: nullableNumber(value.analysis_id, 'analysis_id'),
    analysis_job_id: nullableString(value.analysis_job_id, 'analysis_job_id'),
    game: value.game,
    map: nullableString(value.map, 'map'),
    agent: nullableString(value.agent, 'agent'),
    game_mode: nullableString(value.game_mode, 'game_mode'),
    match_id: nullableString(value.match_id, 'match_id'),
    file_size_bytes: nullableNumber(value.file_size_bytes, 'file_size_bytes'),
    archived_at: nullableString(value.archived_at, 'archived_at'),
    retention_expires_at: nullableString(value.retention_expires_at, 'retention_expires_at'),
    has_match_data: value.has_match_data,
  }
}

function parseProductionArchiveDetail(value: unknown): ProductionArchiveDetail {
  const summary = parseProductionArchiveSummary(value)
  if (!isRecord(value)) throw new Error('Production archive detail is invalid')
  if (value.match_data !== null && !isRecord(value.match_data)) {
    throw new Error('Production archive field match_data is invalid')
  }
  return { ...summary, match_data: value.match_data as Record<string, unknown> | null }
}

function fixtureId(archiveId: string): string {
  return `production-fixture:${archiveId}`
}

export class ProductionVodFixtureLibrary {
  private activeFixture: PendingRecording | null = null

  async list(auth: AuthManager, limit = 30): Promise<ProductionArchiveSummary[]> {
    const response = await auth.getApi().get('/api/recordings/archive', { params: { limit } })
    const body = response.data
    if (!isRecord(body) || body.source !== 'production_archive' || !Array.isArray(body.archives)) {
      throw new Error('Production archive library response is invalid')
    }
    return body.archives.map(parseProductionArchiveSummary)
  }

  async mount(auth: AuthManager, archiveId: string): Promise<PendingRecording> {
    const response = await auth.getApi().get(`/api/recordings/archive/${archiveId}`)
    const body = response.data
    if (!isRecord(body) || body.source !== 'production_archive') {
      throw new Error('Production archive detail response is invalid')
    }
    const archive = parseProductionArchiveDetail(body.archive)
    if (!archive.archived_at) {
      throw new Error('This production archive has no archived timestamp and cannot be mounted')
    }
    const recordedAt = Date.parse(archive.archived_at)
    if (!Number.isFinite(recordedAt)) {
      throw new Error('This production archive has an invalid archived timestamp')
    }

    const missingFields = [
      archive.game_mode === null ? 'game_mode' : null,
      archive.match_data === null ? 'match_data' : null,
    ].filter((field): field is string => field !== null)

    this.activeFixture = {
      id: fixtureId(archive.archive_id),
      path: '',
      riotName: '',
      riotTag: '',
      game: archive.game,
      map: archive.map,
      agent: archive.agent,
      gameMode: archive.game_mode ?? '',
      timeline: archive.match_data as MatchData | null,
      recordedAt,
      analysed: false,
      archiveId: archive.archive_id,
      cloudArchived: true,
      fileSizeBytes: archive.file_size_bytes ?? undefined,
      matchId: archive.match_id,
      productionFixture: {
        source: 'production_archive',
        readOnly: true,
        analysisState: archive.analysis_state,
        missingFields,
      },
    }
    return this.activeFixture
  }

  getActive(): PendingRecording | null {
    return this.activeFixture
  }

  getById(id: string): PendingRecording | undefined {
    return this.activeFixture?.id === id ? this.activeFixture : undefined
  }

  unmount(id?: string): boolean {
    if (!this.activeFixture || (id && this.activeFixture.id !== id)) return false
    this.activeFixture = null
    return true
  }
}
