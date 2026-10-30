/** Copy and state for the "Get FACEIT coaching" row on a CS2 recording. No network here. */
export type FaceitLookup =
  | { status: 'matched'; match: { match_id: string; map: string | null; score?: string | null; result?: string | null } }
  | { status: 'not_connected' }
  | { status: 'no_match'; reason: 'none_in_window' | 'ambiguous' | 'no_history' }
  | { status: 'error'; message: string }

export interface FaceitAttachView {
  /** Show the row at all. */
  visible: boolean
  line: string
  /** Offer the one action (needs a confirm tap). */
  canAttach: boolean
}

const mapLabel = (map: string | null | undefined) => {
  const m = (map ?? '').replace(/^de_|^cs_/i, '')
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : null
}

export function faceitAttachView(lookup: FaceitLookup | null, linked: { jobId: string } | null): FaceitAttachView {
  if (linked) return { visible: true, line: 'FACEIT coaching is queued for this match. It appears in Coaching reviews when ready.', canAttach: false }
  if (!lookup) return { visible: false, line: '', canAttach: false }
  switch (lookup.status) {
    case 'matched': {
      const where = mapLabel(lookup.match.map)
      const score = lookup.match.score ? ` (${lookup.match.score})` : ''
      return { visible: true, line: `This looks like your FACEIT match${where ? ` on ${where}` : ''}${score}. FACEIT coaching reads the full demo and coaches you, not the lobby.`, canAttach: true }
    }
    case 'no_match':
      return lookup.reason === 'ambiguous'
        ? { visible: true, line: 'More than one FACEIT match fits this recording, so we won\'t guess. Attach the demo from the match page instead.', canAttach: false }
        : { visible: false, line: '', canAttach: false }
    case 'error':
      return { visible: true, line: lookup.message, canAttach: false }
    default:
      return { visible: false, line: '', canAttach: false }
  }
}

export const FACEIT_CONFIRM = 'This uses 1 analysis from your plan.'
