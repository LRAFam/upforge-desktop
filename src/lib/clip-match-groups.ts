import type { ClipRecord } from '../env.d.ts'
import { topMomentClips } from './clip-priority'

export type ClipTrigger = ClipRecord['trigger']

export interface ClipMatchGroup {
  key: string
  matchId: string | null
  agent: string | null
  map: string | null
  savedAt: number
  clips: ClipRecord[]
  topMoments: ClipRecord[]
  triggerCounts: Partial<Record<ClipTrigger, number>>
}

const TRIGGER_LABELS: Partial<Record<ClipTrigger, string>> = {
  kill: 'kill',
  multikill: 'multi',
  ace: 'ace',
  clutch: 'clutch',
  hotkey: 'bookmark',
  manual: 'manual',
}

function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function groupKey(clip: ClipRecord): string {
  if (clip.matchId) return `match:${clip.matchId}`
  const agent = clip.agent ?? 'unknown'
  return `orphan:${agent}:${dayKey(clip.savedAt)}`
}

function countTriggers(clips: ClipRecord[]): Partial<Record<ClipTrigger, number>> {
  const counts: Partial<Record<ClipTrigger, number>> = {}
  for (const c of clips) {
    counts[c.trigger] = (counts[c.trigger] ?? 0) + 1
  }
  return counts
}

/** Group clips by match (or agent+day for orphans), newest match first. */
export function buildClipMatchGroups(clips: ClipRecord[]): ClipMatchGroup[] {
  const buckets = new Map<string, ClipRecord[]>()

  for (const clip of clips) {
    const key = groupKey(clip)
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(clip)
  }

  const groups: ClipMatchGroup[] = []
  for (const [key, groupClips] of buckets) {
    const sorted = groupClips.slice().sort((a, b) => b.savedAt - a.savedAt)
    const first = sorted[0]
    groups.push({
      key,
      matchId: first.matchId,
      agent: first.agent,
      map: first.map,
      savedAt: sorted[0]?.savedAt ?? 0,
      clips: sorted,
      topMoments: topMomentClips(sorted, 3),
      triggerCounts: countTriggers(sorted),
    })
  }

  return groups.sort((a, b) => b.savedAt - a.savedAt)
}

export function formatTriggerBreakdown(counts: Partial<Record<ClipTrigger, number>>): string {
  const parts: string[] = []
  const order: ClipTrigger[] = ['kill', 'multikill', 'ace', 'clutch', 'hotkey', 'manual']
  for (const trigger of order) {
    const n = counts[trigger]
    if (!n) continue
    const label = TRIGGER_LABELS[trigger] ?? trigger
    parts.push(`${n} ${label}${n !== 1 && label !== 'multi' ? 's' : ''}`)
  }
  return parts.join(' · ')
}

export function formatMatchGroupLabel(group: ClipMatchGroup, now = Date.now()): string {
  const agent = group.agent ?? 'Unknown agent'
  const map = group.map ? ` · ${group.map}` : ''
  const rel = relativeDayLabel(group.savedAt, now)
  if (group.matchId) return `${rel} — ${agent}${map}`
  return `${rel} — ${agent}${map} (unlinked)`
}

function relativeDayLabel(savedAt: number, now: number): string {
  const DAY = 86_400_000
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const todayMs = today.getTime()
  if (savedAt >= todayMs) return 'Today'
  if (savedAt >= todayMs - DAY) return 'Yesterday'
  if (now - savedAt < 7 * DAY) return 'This week'
  return new Date(savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
