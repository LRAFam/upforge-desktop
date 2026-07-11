import type { Router } from 'vue-router'
import type { AnalysisItem } from '../env.d.ts'
import type { PrimaryGame } from './games'
import { analysisResultsUrl, desktopVodResultsUrl } from './games'
import { pendingTimeline } from '../stores/pendingTimeline'
import { isAnalysisProcessing } from './dashboard-match-row'

/** Open an analysis row — timeline in-app (Valorant), web, or Deadlock results. */
export async function openGameAnalysis(
  game: PrimaryGame,
  item: AnalysisItem,
  router: Router,
): Promise<void> {
  if (item.game_mode === 'DEADLOCK' && item.job_id) {
    void window.api.deadlock.openResults(item.job_id)
    return
  }
  if (game === 'cs2') {
    if (item.cs2_source === 'desktop_vod' && item.id) {
      try {
        const data = await window.api.analyses.getTimeline(item.id)
        if (data) {
          pendingTimeline.value = data
          await router.push({ path: '/vod-review', query: { timelineId: String(item.id) } })
          return
        }
      } catch { /* fall through to web */ }
      window.open(desktopVodResultsUrl('cs2', item.id), '_blank')
      return
    }
    if (item.job_id) {
      window.open(analysisResultsUrl('cs2', item.job_id), '_blank')
      return
    }
  }
  if (game === 'valorant' && !isAnalysisProcessing(item)) {
    try {
      const data = await window.api.analyses.getTimeline(item.id)
      if (data) {
        pendingTimeline.value = data
        await router.push({ path: '/vod-review', query: { timelineId: String(item.id) } })
        return
      }
    } catch { /* fall through to web */ }
  }
  window.open(analysisResultsUrl(game, item.id), '_blank')
}
