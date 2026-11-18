/**
 * Result screen "closes the loop" for an assigned drill: why it was assigned, where it stands, and what the
 * next matches check. Only API fields are used (GET /api/drills row + the POST session `drill` state);
 * nothing is guessed from text. Older APIs send no practice/verified fields: handled as before.
 * Pure helpers, no Vue / IPC.
 */
import { coachingStatLine, isMatchStatsDrill, type CoachingDrillSourceFields } from './coaching-drill-stat'
import type { TrainerDrillState } from './trainer-sync'

/** The GET /api/drills fields this screen reads (all optional: older APIs omit the newer ones). */
export interface DrillLoopSource extends CoachingDrillSourceFields {
  id: number
  title?: string | null
  status?: string | null
  success_metric?: string | null
  verified_at?: string | null
  /** match_stats | video_score; null on a verified row = older record (may have been a trainer pass). */
  verified_by?: string | null
  practice_passed_at?: string | null
}

export type DrillLoopStateKey =
  | 'practising' | 'practice_target_hit' | 'verified' | 'passed_legacy' | 'paused' | 'closed'

export interface DrillLoop {
  /** Why this drill was assigned (the API's reason), or null when the API gave none. */
  why: string | null
  /** The match stat behind it ("HS 16% → target 19% · now 17%"), match-stat drills only. */
  stat: string | null
  state: { key: DrillLoopStateKey; label: string; text: string }
  /** What the next matches check, or null when there is nothing left to check. */
  next: string | null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/**
 * The loop for the drill this run counted towards, or null for free play (no assigned drill on record).
 * `drill` is the /api/drills row (may be missing: completed drills drop out of the active list);
 * `state` is what the API said after this run (may be missing while the run is still uploading).
 */
export function drillLoop(
  drill: DrillLoopSource | null | undefined,
  state: TrainerDrillState | null | undefined,
  /** Matches how the screen shows scores (10 where scores read "/ 1000"). */
  scoreScale = 1,
): DrillLoop | null {
  if (!drill && !state) return null
  const fromMatches = isMatchStatsDrill(drill)
  const status = state?.status ?? drill?.status ?? 'active'
  const passMark = state?.pass_score
  const verifiedBy = state?.verified_by ?? drill?.verified_by ?? null
  const verified = state?.verified ?? !!drill?.verified_at
  const practicePassed = state?.practice_passed ?? !!drill?.practice_passed_at
  const statLine = fromMatches ? coachingStatLine(drill?.stat)?.text ?? null : null
  const metric = text(drill?.success_metric)

  const why = fromMatches
    ? text(drill?.why)
    : text(drill?.title ?? state?.title) ? `Assigned from your match review: ${text(drill?.title ?? state?.title)}.` : null

  const nextCheck = fromMatches
    ? `Your next ranked games check ${statLine ? statLine.replace(/ · now .*$/, '') : 'the same stat'}.`
    : metric ? `Your next analysed match checks: ${metric}` : null

  let s: DrillLoop['state']
  let next: string | null = nextCheck
  if (verified && (verifiedBy === 'match_stats' || verifiedBy === 'video_score')) {
    s = {
      key: 'verified',
      label: 'Verified in your matches',
      text: verifiedBy === 'match_stats' ? 'Your ranked games showed the change. This drill is done.' : 'A later match review showed the change. This drill is done.',
    }
    next = null
  } else if (verified || (state?.completed && state.practice_passed === undefined)) {
    // Older record or older API: a trainer pass completed the drill. That is not match evidence.
    s = { key: 'passed_legacy', label: 'Drill passed', text: 'Passed in the trainer. Your matches did not check this one.' }
    next = null
  } else if (status === 'needs_reassignment') {
    const tries = state?.attempts_allowed ?? 3
    // The API's `next` on a paused drill is the same drill one step easier, already assigned.
    const tier = state?.next?.trainer_difficulty ? ` (${cap(state.next.trainer_difficulty)})` : ''
    const then = state?.next ? `An easier version${tier} is ready.` : 'Your next matches can assign a new drill.'
    s = { key: 'paused', label: 'Paused', text: `Paused after ${tries} tries below the target. ${then}` }
    next = null
  } else if (status !== 'active') {
    s = status === 'completed'
      ? { key: 'closed', label: 'Marked done', text: 'You marked this drill done. Your matches did not check it.' }
      : { key: 'closed', label: 'Closed', text: 'This drill is no longer active.' }
    next = null
  } else if (practicePassed) {
    s = { key: 'practice_target_hit', label: 'Practice target hit · waiting for matches', text: 'You hit the practice target. Your next matches check whether the same stat moves.' }
  } else {
    s = {
      key: 'practising',
      label: 'Practice target not hit yet',
      text: passMark ? `Score ${passMark * scoreScale} or more to hit the practice target.` : 'Reach the drill’s pass score to hit the practice target.',
    }
  }
  return { why, stat: statLine, state: s, next }
}
