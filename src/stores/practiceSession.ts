import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { SessionStep } from '../lib/structured-session'
import type { TrainerScenarioKey } from '../lib/trainer-scenarios'
import type { SessionResult } from './trainerResult'

/**
 * Practice state that must outlive the Practice screen. Every run opens the result screen (a separate
 * route), and players leave between guided steps (e.g. to change sensitivity), so state kept inside
 * the view was lost: "Played today" never showed and a guided session vanished without a word.
 */
export interface GuidedSessionState {
  active: boolean
  stepIndex: number
  plan: SessionStep[]
  results: Array<SessionResult & { scenario: TrainerScenarioKey }>
}

interface RecentRun {
  scenario: string
  completed_at: string
  score?: number
  duration_seconds?: number
  metadata?: Record<string, unknown>
}

/** Local calendar day (the player's "today"), e.g. 2026-11-18. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Scenarios with a run finished today (local day), from saved history plus runs this app has seen. */
export function scenariosPlayedToday(
  runs: Iterable<{ scenario: string; completed_at: string }>,
  now: Date = new Date(),
): Set<string> {
  const today = localDayKey(now)
  const played = new Set<string>()
  for (const run of runs) {
    const at = new Date(run.completed_at)
    if (!Number.isNaN(at.getTime()) && localDayKey(at) === today) played.add(run.scenario)
  }
  return played
}

export const usePracticeSessionStore = defineStore('practiceSession', () => {
  /** The guided session (warm-up → focus → cool-down) in progress, or null. */
  const guided = ref<GuidedSessionState | null>(null)
  /** Runs this app has seen, so "Played today" shows before the history refresh includes them. */
  const recentRuns = ref<RecentRun[]>([])

  function recordRun(run: Omit<RecentRun, 'completed_at'> & { completed_at?: string | null }) {
    recentRuns.value.push({
      scenario: run.scenario, completed_at: run.completed_at || new Date().toISOString(),
      score: run.score, duration_seconds: run.duration_seconds, metadata: run.metadata,
    })
    if (recentRuns.value.length > 50) recentRuns.value.splice(0, recentRuns.value.length - 50)
  }

  return { guided, recentRuns, recordRun }
})
