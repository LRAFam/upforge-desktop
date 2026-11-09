/**
 * Failures found right after app start (analyses that failed / uploads cut off while UpForge was
 * closed) used to show only as cards or activity lines. Collect them for a short window after
 * the first session starts and show ONE summary notification + ONE activity entry. Each item is
 * announced at most once, even across restarts.
 */

import fs from 'fs'
import path from 'path'

export type StartupFailureKind = 'analysis' | 'upload'

export interface StartupFailure {
  /** Stable id, e.g. `analysis:<jobId>` or `upload:<recordingId>`. */
  key: string
  kind: StartupFailureKind
}

export interface StartupFailureSummaryDeps {
  notify: (n: { title: string; body: string }) => void
  logActivity: (message: string) => void
  loadSeen: () => string[]
  saveSeen: (ids: string[]) => void
  /** Wait this long after the last failure before summarising (default 5 s). */
  settleMs?: number
  /** Stop collecting this long after begin() (default 3 min). */
  windowMs?: number
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

export function summariseStartupFailures(counts: Record<StartupFailureKind, number>): string {
  const parts: string[] = []
  if (counts.analysis) parts.push(`${plural(counts.analysis, 'analysis', 'analyses')} failed`)
  if (counts.upload) parts.push(`${plural(counts.upload, 'upload was', 'uploads were')} interrupted`)
  return `While UpForge was closed, ${parts.join(' and ')}. Open UpForge to retry.`
}

export class StartupFailureSummary {
  private pending = new Map<string, StartupFailure>()
  private started = false
  private open = false
  private settleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private deps: StartupFailureSummaryDeps) {}

  /** Start collecting — once per app run (later logins do not reopen it). */
  begin(): void {
    if (this.started) return
    this.started = true
    this.open = true
    const t = setTimeout(() => { this.flush(); this.open = false }, this.deps.windowMs ?? 180_000)
    t.unref?.()
  }

  /** A failure found by startup sync. No-op outside the startup window. */
  note(failure: StartupFailure): void {
    if (!this.open) return
    this.pending.set(failure.key, failure)
    if (this.settleTimer) clearTimeout(this.settleTimer)
    this.settleTimer = setTimeout(() => this.flush(), this.deps.settleMs ?? 5_000)
    this.settleTimer.unref?.()
  }

  flush(): void {
    if (this.settleTimer) { clearTimeout(this.settleTimer); this.settleTimer = null }
    if (this.pending.size === 0) return
    let seen: string[] = []
    try { seen = this.deps.loadSeen() } catch { /* treat as none */ }
    const seenSet = new Set(seen)
    const fresh = [...this.pending.values()].filter((f) => !seenSet.has(f.key))
    this.pending.clear()
    if (fresh.length === 0) return
    const counts: Record<StartupFailureKind, number> = { analysis: 0, upload: 0 }
    for (const f of fresh) counts[f.kind]++
    const body = summariseStartupFailures(counts)
    try { this.deps.saveSeen([...seen, ...fresh.map((f) => f.key)]) } catch { /* best effort */ }
    this.deps.logActivity(body)
    this.deps.notify({ title: 'UpForge — some matches need attention', body })
  }
}

/** JSON list of announced keys, newest last, capped. */
export function fileSeenStore(file: string, cap = 300): { load: () => string[]; save: (ids: string[]) => void } {
  return {
    load: () => {
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown
        return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
      } catch {
        return []
      }
    },
    save: (ids) => {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify([...new Set(ids)].slice(-cap)))
    },
  }
}
