import path from 'path'

const MAX_EXCLUDED_OBS_RECORDINGS = 250

/** Keep a bounded newest-first list of OBS recordings that must never become matches. */
export function addExcludedObsRecordingPath(
  existing: string[] | undefined,
  filePath: string,
): string[] {
  const trimmed = filePath.trim()
  if (!trimmed) return existing ?? []
  const normalized = path.normalize(trimmed)

  const deduped = (existing ?? [])
    .map((candidate) => path.normalize(candidate))
    .filter((candidate) => candidate !== normalized)

  return [normalized, ...deduped].slice(0, MAX_EXCLUDED_OBS_RECORDINGS)
}
