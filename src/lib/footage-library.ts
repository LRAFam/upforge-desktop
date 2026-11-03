import type { PendingRecording } from '../env.d'
import { cloudRetention, type CloudFile } from './cloud-storage'
import { chooseVideoSource, parseRetention } from './cloud-retention'
export type LibraryRecording = PendingRecording & { cloudFile?: CloudFile; cloudOnly?: boolean }
/** Saved archive identity joins copies; titles and maps are not file identifiers. */
export function mergeFootage(local: PendingRecording[], cloud: CloudFile[]): LibraryRecording[] {
  const represented = new Set(local.map(r => r.archiveId).filter(Boolean))
  const byId = new Map(cloud.filter(f => f.kind === 'recording').map(f => [f.id, f]))
  return [
    ...local.map(r => ({ ...r, cloudFile: r.archiveId ? byId.get(r.archiveId) : undefined })),
    ...[...byId.values()].filter(f => !represented.has(f.id)).map(f => ({
      id: `cloud:${f.id}`, archiveId: f.id, path: '', game: f.game ?? 'unknown', map: f.map,
      agent: f.agent ?? null, gameMode: '', recordedAt: Date.parse(f.created_at), analysed: false,
      hasLocalFile: false, cloudUploaded: f.status === 'archived', cloudArchived: f.status === 'archived',
      cloudFile: f, cloudOnly: true,
      ...(typeof f.analysis_id === 'number' && f.analysis_id > 0 ? { analysisId: f.analysis_id } : {}),
    })),
  ].sort((a,b) => b.recordedAt - a.recordedAt)
}
export function footageUnavailable(rec: LibraryRecording, now = Date.now()): string | null {
  if (rec.hasLocalFile) return null
  if (!rec.cloudFile) return null
  // Removed full video: an analysed match still opens (notes, clips, stats); otherwise say so plainly.
  if (cloudVideoRemoved(rec)) return rec.analysisId != null ? null : 'Full video no longer stored'
  if (parseRetention(rec.cloudFile.retention)) return rec.cloudFile.status !== 'archived' ? (rec.cloudFile.status === 'uploading' ? 'Uploading' : 'Upload failed') : null
  if (cloudRetention(rec.cloudFile.expires_at, now).state === 'expired') return 'Retention ended'
  if (rec.cloudFile.status !== 'archived') return rec.cloudFile.status === 'uploading' ? 'Uploading' : 'Upload failed'
  return null
}

/** The cloud copy's full video was removed (cloud retention). The file on this PC is unaffected. */
export function cloudVideoRemoved(rec: LibraryRecording): boolean {
  return parseRetention(rec.cloudFile?.retention)?.state === 'removed'
}

/** Where this row's video plays from: this PC first, then the cloud while it is stored. */
export function footageSource(rec: LibraryRecording) {
  return chooseVideoSource({ hasLocalFile: rec.hasLocalFile, inCloud: !!rec.archiveId, retention: parseRetention(rec.cloudFile?.retention) })
}
