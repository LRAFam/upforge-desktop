/**
 * Full AI review: which stored habits this match flagged again, from GET /api/analysis/{id}
 * `habit_history` (API ≥ 2026-11-07). Counts come from the API's habit evidence, never guessed.
 */
export interface HabitHistoryRow { id: number; title: string; category?: string | null; earlier: number | null; trend?: string | null }
export interface HabitHistoryDrill { id: number; title: string; instructions?: string | null; success_metric?: string | null; trainer_scenario?: string | null }
export interface HabitHistory { habits: HabitHistoryRow[]; drill: HabitHistoryDrill | null }

export interface HabitLine { id: number; title: string; tone: 'habit' | 'again' | 'new' | 'plain'; note: string | null }


export function sanitizeHabitHistory(raw: unknown): HabitHistory | null {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
  if (!r) return null
  const habits = (Array.isArray(r.habits) ? r.habits : [])
    .filter((h): h is HabitHistoryRow => !!h && typeof h === 'object'
      && Number.isInteger((h as HabitHistoryRow).id) && typeof (h as HabitHistoryRow).title === 'string' && !!(h as HabitHistoryRow).title.trim())
    .map(h => ({ ...h, earlier: Number.isInteger(h.earlier) && (h.earlier as number) >= 0 ? h.earlier : null }))
  const d = r.drill && typeof r.drill === 'object' ? r.drill as HabitHistoryDrill : null
  const drill = d && Number.isInteger(d.id) && typeof d.title === 'string' && d.title.trim() ? d : null
  return { habits, drill }
}

/** One line per habit: a repeat is called a habit and put first; improving habits say so. */
export function habitLines(h: HabitHistory | null | undefined): HabitLine[] {
  return (h?.habits ?? []).map(row => {
    const less = row.trend === 'improving' ? ' Coming up less than before, so keep going.' : ''
    if (row.earlier == null) return { id: row.id, title: row.title, tone: 'plain', note: less.trim() || null }
    if (row.earlier >= 2) {
      return { id: row.id, title: row.title, tone: 'habit', note: `Also in ${row.earlier} earlier analysed ${row.earlier === 1 ? 'match' : 'matches'}. This is a habit, not a one-off, so fix it first.${less}` }
    }
    if (row.earlier === 1) return { id: row.id, title: row.title, tone: 'again', note: `Also came up in 1 earlier analysed match.${less}` }
    return { id: row.id, title: row.title, tone: 'new', note: 'New this match.' }
  })
}

/** "Practise this" from the review: the drill assigned from this analysis. */
export function habitDrillRoute(h: HabitHistory | null | undefined): { path: string; query: Record<string, string> } | null {
  const d = h?.drill
  if (!d) return null
  const query: Record<string, string> = { drill: d.title.trim() }
  const why = h!.habits[0]?.title
  if (why) query.why = why
  if (d.trainer_scenario) query.scenario = d.trainer_scenario
  return { path: '/training', query }
}

