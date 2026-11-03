/**
 * Where a finished analysis opens: always inside the app. The website is only ever a secondary link.
 *
 * Order for a desktop VOD analysis (analysis_logs id, any game):
 *   1. the match page (`/vod-review?timelineId=`) when the API has its timeline;
 *   2. otherwise Coaching reviews with that analysis selected (`/recordings?view=coaching&analysis=`).
 * League stats analyses (their own ids) open the League match report (`/report/<riot id>?game=lol`).
 */
import type { Router } from 'vue-router'
import type { PrimaryGame } from './games'
import { matchReportPath } from './match-report'
import { openAnalysisVodReview } from './open-vod-review'

type RouteLocation = { path: string; query: Record<string, string> }

const validId = (id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0

/** Coaching reviews with one analysis selected (works for every game's analysis list). */
export function coachingReviewsLocation(analysisId: number): RouteLocation {
  return { path: '/recordings', query: { view: 'coaching', analysis: String(analysisId) } }
}

/** The in-app League report for a League stats analysis row, or null without a valid Riot match id. */
export function lolAnalysisReportPath(item: { match_id?: string | null } | null | undefined): string | null {
  return matchReportPath('lol', item?.match_id ?? null)
}

export type InAppDestination = 'match' | 'report' | 'reviews'

/** Open a desktop VOD analysis in the app. Never opens the browser. */
export async function openAnalysisInApp(
  router: Pick<Router, 'push'>,
  analysisId: number,
  opts?: { source?: string; coachNotes?: boolean },
): Promise<InAppDestination | null> {
  if (!validId(analysisId)) return null
  try {
    if (await openAnalysisVodReview(router as Router, analysisId, { source: opts?.source ?? 'desktop_in_app', coachNotes: opts?.coachNotes })) return 'match'
  } catch { /* timeline unavailable: fall through to Coaching reviews */ }
  await router.push(coachingReviewsLocation(analysisId)).catch(() => {})
  return 'reviews'
}

/** Open a League stats analysis row (its own id + Riot match id) in the app. */
export async function openLolAnalysisInApp(
  router: Pick<Router, 'push'>,
  item: { id: number; match_id?: string | null },
): Promise<InAppDestination | null> {
  const path = lolAnalysisReportPath(item)
  if (path) {
    await router.push(path).catch(() => {})
    return 'report'
  }
  return validId(item.id) ? openAnalysisInApp(router, item.id, { source: 'desktop_lol_row' }) : null
}

/**
 * `upforge://analysis/<game>/<id>` from the website's "Open in the UpForge app" button.
 * The web results page `/<game>/results/<id>` takes either id kind for League (native first, like the web),
 * so League tries the stats analysis first; every game then tries the VOD analysis.
 */
export async function openDeepLinkAnalysis(
  router: Pick<Router, 'push'>,
  link: { game: PrimaryGame; analysisId: number },
): Promise<InAppDestination | null> {
  if (!validId(link.analysisId)) return null
  if (link.game === 'lol') {
    const native = await window.api?.lol?.getAnalysis?.(link.analysisId).catch(() => null) as { match_id?: string | null; analysis?: { match_id?: string | null } } | null | undefined
    const path = lolAnalysisReportPath(native?.analysis ?? native)
    if (path) {
      await router.push(path).catch(() => {})
      return 'report'
    }
  }
  return openAnalysisInApp(router, link.analysisId, { source: `desktop_deep_link_${link.game}` })
}
