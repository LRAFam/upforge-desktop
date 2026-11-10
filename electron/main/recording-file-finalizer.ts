/** Retry stopped OBS files without retaining capture ownership or losing the durable catalogue row. */
export interface FinalizingFileRow { id: string; path: string; fileFinalizing?: boolean }
interface FileRevision { size: number; mtimeMs: number }
export interface RecordingFileFinalizerDeps {
  owner: () => number | null
  rows: () => FinalizingFileRow[]
  canWork: () => boolean
  stat: (path: string) => Promise<FileRevision>
  probe: (path: string) => Promise<{ ok: boolean }>
  complete: (id: string, owner: number | null) => Promise<void>
  now?: () => number
}

export function createRecordingFileFinalizer(deps: RecordingFileFinalizerDeps) {
  let running = false
  let previousOwner: number | null | undefined
  const samples = new Map<string, FileRevision & { since: number }>()
  const same = (a: FileRevision, b: FileRevision) => a.size === b.size && a.mtimeMs === b.mtimeMs
  const now = deps.now ?? Date.now
  return {
    async tick(): Promise<void> {
      if (running || !deps.canWork()) return
      running = true
      const owner = deps.owner()
      if (owner !== previousOwner) { samples.clear(); previousOwner = owner }
      try {
        const rows = deps.rows().filter(row => row.fileFinalizing && row.path)
        const ids = new Set(rows.map(row => row.id))
        for (const id of samples.keys()) if (!ids.has(id)) samples.delete(id)
        for (const row of rows) {
          const stillCurrent = () => deps.owner() === owner && deps.canWork()
            && deps.rows().some(current => current.id === row.id && current.path === row.path && current.fileFinalizing)
          if (!stillCurrent()) return
          try {
            const current = await deps.stat(row.path)
            if (!stillCurrent()) return
            if (current.size <= 0) { samples.delete(row.id); continue }
            const previous = samples.get(row.id)
            if (!previous || !same(previous, current)) { samples.set(row.id, { ...current, since: now() }); continue }
            if (now() - previous.since < 2000) continue
            // A quiet size alone does not prove a usable muxed recording.
            if (!(await deps.probe(row.path)).ok || !stillCurrent()) continue
            const afterProbe = await deps.stat(row.path)
            if (!stillCurrent()) return
            if (!same(current, afterProbe)) { samples.set(row.id, { ...afterProbe, since: now() }); continue }
            await deps.complete(row.id, owner)
            samples.delete(row.id)
          } catch {
            // The disk/OBS can remain unavailable longer than one launch. Keep the saved row.
            samples.delete(row.id)
          }
        }
      } finally { running = false }
    },
  }
}
