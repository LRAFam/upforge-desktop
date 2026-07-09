import { listRecentDemosInDir } from './demo-finder'
import { listRecentCS2Demos } from './cs2-demo-finder'
import { resolveDeadlockReplayDirs } from './deadlock-paths'
import type { RecordingsStore } from './recordings-store'
import type { SettingsManager } from './settings-manager'
import {
  rankDemosForRecording,
  type DemoFileInfo,
  type RankedDemoCandidate,
} from '../../src/lib/demo-recording-match'
import { buildRecordingDemoHint, type RecordingDemoHint } from '../../src/lib/demo-preview-match'

export interface DemoCandidateListResult {
  candidates: RankedDemoCandidate[]
  recording: {
    id: string
    game: string
    map: string | null
    recordedAt: number
    matchStartTime: number | null
  } | null
  recordingHint: RecordingDemoHint | null
  error?: string
}

async function collectDemoFiles(
  game: 'cs2' | 'deadlock',
  settings: SettingsManager,
): Promise<DemoFileInfo[]> {
  if (game === 'cs2') {
    const listed = await listRecentCS2Demos(settings.get().cs2DemoDir, 24)
    return listed.files
  }

  const dirs = await resolveDeadlockReplayDirs()
  const seen = new Set<string>()
  const files: DemoFileInfo[] = []
  for (const dir of dirs) {
    const listed = listRecentDemosInDir(dir, 24)
    for (const file of listed.files) {
      if (seen.has(file.path)) continue
      seen.add(file.path)
      files.push(file)
    }
  }
  files.sort((a, b) => b.modifiedAt - a.modifiedAt)
  return files.slice(0, 24)
}

export async function listDemoCandidatesForRecording(
  store: RecordingsStore,
  settings: SettingsManager,
  recordingId: string,
): Promise<DemoCandidateListResult> {
  const rec = store.getById(recordingId)
  if (!rec) {
    return { candidates: [], recording: null, recordingHint: null, error: 'Recording not found' }
  }
  if (rec.game !== 'cs2' && rec.game !== 'deadlock') {
    return { candidates: [], recording: null, recordingHint: null, error: 'Demo attach is only supported for CS2 and Deadlock' }
  }

  const files = await collectDemoFiles(rec.game, settings)
  const candidates = rankDemosForRecording(files, {
    recordedAt: rec.recordedAt,
    matchStartTime: rec.timeline?.matchStartTime ?? null,
    map: rec.map ?? rec.timeline?.map ?? null,
  })

  return {
    candidates,
    recording: {
      id: rec.id,
      game: rec.game,
      map: rec.map ?? rec.timeline?.map ?? null,
      recordedAt: rec.recordedAt,
      matchStartTime: rec.timeline?.matchStartTime ?? null,
    },
    recordingHint: buildRecordingDemoHint(rec),
  }
}
