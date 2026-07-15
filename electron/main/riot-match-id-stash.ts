/** Apply the first Riot match id seen during agent select / live tracking. */
export function stashMatchIdFields(
  rawId: string | null | undefined,
  fields: { timelineMatchId?: string | null; currentMatchId?: string | null },
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

  if (!currentMatchId) {
    currentMatchId = id
    changed = true
  }
  if (!timelineMatchId) {
    timelineMatchId = id
    changed = true
  }

  return { timelineMatchId, currentMatchId, changed }
}
