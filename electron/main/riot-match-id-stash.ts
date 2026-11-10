/**
 * Apply the first Riot match id seen during agent select / live tracking.
 * Before a match is tracked (`trackingMatch: false`) a new pregame id replaces a
 * stashed one — the earlier lobby was dodged and its id must not reach the next match.
 */
export function stashMatchIdFields(
  rawId: string | null | undefined,
  fields: { timelineMatchId?: string | null; currentMatchId?: string | null; trackingMatch?: boolean },
): { timelineMatchId: string | null; currentMatchId: string | null; changed: boolean } {
  const id = rawId?.trim()
  if (!id) {
    return {
      timelineMatchId: fields.timelineMatchId ?? null,
      currentMatchId: fields.currentMatchId ?? null,
      changed: false,
    }
  }

  let changed = false
  let timelineMatchId = fields.timelineMatchId ?? null
  let currentMatchId = fields.currentMatchId ?? null

  if (!currentMatchId || (fields.trackingMatch === false && currentMatchId !== id)) {
    currentMatchId = id
    changed = true
  }
  if (!timelineMatchId) {
    timelineMatchId = id
    changed = true
  }

  return { timelineMatchId, currentMatchId, changed }
}
