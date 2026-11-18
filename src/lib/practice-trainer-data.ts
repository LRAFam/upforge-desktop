import type { CoachingDrill, SharedTrainingPlan, TrainingBenchmark, TrainingHistory } from '../env'

/**
 * Practice's trainer data (history, plan, drills, insights, benchmark) with "could not fetch" kept apart
 * from "nothing there". The single-part IPC calls answer null / [] for both, so an offline visit used to
 * blank Practice and save that blank over the remembered copy.
 */
export type Fetched<T> = { ok: true; value: T } | { ok: false }

export interface PracticeDataReply {
  history: Fetched<TrainingHistory | null>
  plan: Fetched<SharedTrainingPlan | null>
  drills: Fetched<CoachingDrill[]>
  insights: Fetched<string[]>
  benchmark: Fetched<TrainingBenchmark | null>
}

/** Same order as Practice's cache entry. */
export type TrainerData = [TrainingHistory | null, SharedTrainingPlan | null, CoachingDrill[], string[], TrainingBenchmark | null]

type Readers = { [K in keyof PracticeDataReply]: () => Promise<PracticeDataReply[K] extends Fetched<infer T> ? T : never> }

/** Main process: run every read; a read that throws (offline, timeout, 5xx) is reported as failed. */
export async function collectPracticeData(read: Readers, onError?: (part: string, err: unknown) => void): Promise<PracticeDataReply> {
  const part = async <T>(name: string, fn: () => Promise<T>): Promise<Fetched<T>> => {
    try {
      return { ok: true, value: await fn() }
    } catch (err) {
      onError?.(name, err)
      return { ok: false }
    }
  }
  const [history, plan, drills, insights, benchmark] = await Promise.all([
    part('history', read.history),
    part('plan', read.plan),
    part('drills', read.drills),
    part('insights', read.insights),
    part('benchmark', read.benchmark),
  ])
  return { history, plan, drills, insights, benchmark }
}

/**
 * Renderer: what Practice shows and caches. A part that failed keeps its last saved value (or stays empty
 * when there is none); `failed` says to show "couldn't refresh". A null reply means signed out.
 */
export function mergePracticeData(
  reply: PracticeDataReply | null,
  previous: TrainerData | null,
): { data: TrainerData; failed: boolean; anyAnswered: boolean } {
  if (!reply) return { data: [null, null, [], [], null], failed: false, anyAnswered: false }
  const keep = <T>(f: Fetched<T>, prev: T): T => (f.ok ? f.value : prev)
  const parts = [reply.history, reply.plan, reply.drills, reply.insights, reply.benchmark]
  return {
    data: [
      keep(reply.history, previous?.[0] ?? null),
      keep(reply.plan, previous?.[1] ?? null),
      keep(reply.drills, previous?.[2] ?? []),
      keep(reply.insights, previous?.[3] ?? []),
      keep(reply.benchmark, previous?.[4] ?? null),
    ],
    failed: parts.some(p => !p.ok),
    anyAnswered: parts.some(p => p.ok),
  }
}

/** Cache the merged data unless a failed part would save "empty" where nothing was saved before. */
export function shouldCachePracticeData(failed: boolean, hadSaved: boolean): boolean {
  return !failed || hadSaved
}

/** The quiet line under the Practice header when a refresh failed. */
export function practiceRefreshNotice(failed: boolean, hadSavedData: boolean): string | null {
  if (!failed) return null
  return hadSavedData
    ? 'Couldn’t refresh. Showing your last saved data.'
    : 'Couldn’t reach UpForge. Check your connection and try again.'
}
