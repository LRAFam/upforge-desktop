/**
 * Delete confirmations for recordings and clips: say exactly what goes and from where. Deleting here
 * only ever removes files on this PC (and the row in the list); a cloud copy stays in Cloud storage.
 */
interface RecordingLike {
  hasLocalFile?: boolean
  path?: string | null
  archiveId?: number | string | null
  cloudUploaded?: boolean
  analysisId?: number | null
}

interface ClipLike {
  uploadStatus?: string | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const hasLocal = (r: RecordingLike) => Boolean(r.hasLocalFile || (r.path && r.path.length > 0))
const inCloud = (r: RecordingLike) => Boolean(r.archiveId || r.cloudUploaded)

/** One recording (the case without the "local only / remove" choice). */
export function recordingDeleteMessage(rec: RecordingLike): string {
  const coaching = rec.analysisId != null ? ' Your AI coaching for this match stays in your account.' : ''
  if (!hasLocal(rec)) {
    return `Remove this match from your list? There's no video file on this PC to delete.${inCloud(rec) ? ' The cloud copy stays in Cloud storage.' : ''}${coaching}`
  }
  if (inCloud(rec)) return `Delete this recording from this PC? The cloud copy stays in Cloud storage.${coaching}`
  return `Delete this recording from this PC? It isn't in the cloud, so the video can't be recovered.${coaching}`
}

export function recordingsBulkDeleteMessage(recs: readonly RecordingLike[]): string {
  const local = recs.filter(hasLocal)
  const cloud = local.filter(inCloud).length
  const only = local.length - cloud
  const parts = [`Delete ${plural(recs.length, 'recording', 'recordings')} from this PC?`]
  if (cloud) parts.push(`${plural(cloud, 'has a cloud copy, which stays', 'have a cloud copy, which stay')} in Cloud storage.`)
  if (only) parts.push(`${plural(only, "isn't", "aren't")} in the cloud and can't be recovered.`)
  if (recs.length > local.length) parts.push(`${plural(recs.length - local.length, 'has', 'have')} no file on this PC and ${recs.length - local.length === 1 ? 'is' : 'are'} only removed from the list.`)
  return parts.join(' ')
}

const clipInCloud = (c: ClipLike) => c.uploadStatus === 'uploaded'

/** Short inline line under a clip's Delete button. */
export function clipDeleteMessage(clip: ClipLike): string {
  return clipInCloud(clip)
    ? 'Delete from this PC? The cloud copy stays in Cloud storage.'
    : "Delete from this PC? It isn't in the cloud, so it can't be recovered."
}

export function clipsBulkDeleteMessage(clips: readonly ClipLike[]): string {
  const cloud = clips.filter(clipInCloud).length
  const only = clips.length - cloud
  const parts = [`Delete ${plural(clips.length, 'clip', 'clips')} from this PC?`]
  if (cloud) parts.push(`${cloud} in the cloud ${cloud === 1 ? 'stays' : 'stay'} there.`)
  if (only) parts.push(`${only} ${only === 1 ? "isn't" : "aren't"} in the cloud and can't be recovered.`)
  return parts.join(' ')
}
