import type { Router } from 'vue-router'
import type { AnalysisItem } from '../env.d.ts'
import type { PrimaryGame } from './games'
import { isAnalysisProcessing } from './dashboard-match-row'
import { coachingReviewsLocation, openAnalysisInApp } from './open-analysis-in-app'

/**
 * Open an analysis row (Home, Coaching reviews) inside the app — never the browser.
 * Match page when a timeline exists; otherwise Coaching reviews with the row selected
 * (Deadlock replay reviews, CS2 web-demo reviews and analyses still being written show there).
 */
export async function openGameAnalysis(
  game: PrimaryGame,
  item: AnalysisItem,
  router: Router,
): Promise<void> {
  const noTimeline = item.game_mode === 'DEADLOCK'
    || (game === 'cs2' && item.cs2_source !== 'desktop_vod')
    || isAnalysisProcessing(item)
  if (noTimeline) {
    await router.push(coachingReviewsLocation(item.id)).catch(() => {})
    return
  }
  await openAnalysisInApp(router, item.id, { source: `desktop_dashboard_${game}` })
}
