import type { PendingRecording } from '../env.d'
import { cloudRetention, type CloudFile } from './cloud-storage'
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
    })),
  ].sort((a,b) => b.recordedAt - a.recordedAt)
}
export function footageUnavailable(rec: LibraryRecording, now = Date.now()): string | null {
  if (rec.hasLocalFile) return null
  if (!rec.cloudFile) return null
  if (cloudRetention(rec.cloudFile.expires_at, now).state === 'expired') return 'Retention ended'
  if (rec.cloudFile.status !== 'archived') return rec.cloudFile.status === 'uploading' ? 'Uploading' : 'Upload failed'
  return null
}
