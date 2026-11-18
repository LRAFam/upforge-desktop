/**
 * The coach's practice drills on a finished Deadlock replay review (coaching.drills from
 * GET /api/deadlock/demo/{jobId}). Same rules as the CS2 review's drills (cs2-result.ts): a drill
 * needs a title, keeps how often and what to do, and at most four are shown.
 * Only drills the AI's claim checks have read are shown (coaching.drills_checked === true). Reviews stored
 * before those checks read drill text have no marker, so they show none.
 */
export interface DeadlockDrill { title: string; description: string; frequency: string }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function deadlockDrills(detail: { coaching?: object | null } | null | undefined): DeadlockDrill[] {
  const coaching = detail?.coaching as { drills?: unknown; drills_checked?: unknown } | null | undefined
  if (coaching?.drills_checked !== true) return []
  const drills = coaching.drills
  return (Array.isArray(drills) ? drills : []).flatMap((d) => {
    const o = (d ?? {}) as Record<string, unknown>
    const title = str(o.title)
    return title ? [{ title, description: str(o.description) ?? '', frequency: str(o.frequency) ?? '' }] : []
  }).slice(0, 4)
}
