/** Copy helpers for the v3 Cloud storage screen: say each storage fact once, and only the ones that exist. */
import type { CloudStorageUsage } from '../../../lib/account-usage'
import { cloudBytes, type CloudKind } from '../../../lib/cloud-storage'

/** The sentence above the used-bytes number. Never repeats the number shown right below it. */
export function capacitySentence(c: CloudStorageUsage): string {
  if (c.remaining_bytes === null) return 'No storage cap on your account.'
  if (c.remaining_bytes === 0) return 'Your cloud space is full. Add capacity or remove cloud copies to upload more.'
  return `${cloudBytes(c.remaining_bytes)} free for clips and recordings.`
}

/**
 * The small facts under the meter. Unknown or zero values are left out, so there is never
 * "Size unavailable included" or "0.0 MB extra storage".
 */
export function capacityFacts(c: CloudStorageUsage): string[] {
  const facts: string[] = []
  if (c.included_bytes !== null) facts.push(`${cloudBytes(c.included_bytes)} included`)
  if (c.addon_bytes > 0) facts.push(`${cloudBytes(c.addon_bytes)} extra storage`)
  if (c.reserved_bytes > 0) facts.push(`${cloudBytes(c.reserved_bytes)} reserved for uploads`)
  return facts
}

/**
 * The library count, named so it can't be mistaken for the Matches or Clips counts:
 * cloud storage holds recordings AND clips from every game on the account.
 */
export function libraryCountLabel(total: number, kind: CloudKind, gameLabel: string | null): string {
  const noun = kind === 'clip' ? (total === 1 ? 'cloud clip' : 'cloud clips')
    : kind === 'recording' ? (total === 1 ? 'cloud recording' : 'cloud recordings')
      : (total === 1 ? 'file' : 'files')
  const scope = gameLabel ? ` · ${gameLabel}` : ' · every game'
  return `${total} ${noun}${kind === 'all' ? ' (recordings and clips)' : ''}${scope}`
}
