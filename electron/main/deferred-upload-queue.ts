import fs from 'fs'
import path from 'path'

export interface DeferredUploadQueueFile {
  version: 1
  recordingIds: string[]
}

export function getDeferredUploadQueuePath(userDataPath: string): string {
  return path.join(userDataPath, 'deferred-uploads.json')
}

export function readDeferredUploadIds(filePath: string): string[] {
  try {
    if (!fs.existsSync(filePath)) return []
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DeferredUploadQueueFile
    if (!raw || raw.version !== 1 || !Array.isArray(raw.recordingIds)) return []
    return [...new Set(raw.recordingIds.filter((id) => typeof id === 'string' && id.length > 0))]
  } catch {
    return []
  }
}

export function writeDeferredUploadIds(filePath: string, ids: string[]): void {
  const payload: DeferredUploadQueueFile = {
    version: 1,
    recordingIds: [...new Set(ids)],
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

export function addDeferredUploadId(filePath: string, id: string): void {
  const ids = readDeferredUploadIds(filePath)
  if (!ids.includes(id)) ids.push(id)
  writeDeferredUploadIds(filePath, ids)
}

export function removeDeferredUploadId(filePath: string, id: string): void {
  writeDeferredUploadIds(
    filePath,
    readDeferredUploadIds(filePath).filter((x) => x !== id),
  )
}
