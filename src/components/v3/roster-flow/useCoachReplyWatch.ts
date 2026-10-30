/**
 * App-wide (mounted once by SidebarV3): keeps the Coaches badge current and shows one desktop
 * notification per new coach reply. Polls every 10 minutes and on window focus (the shared hub
 * loader throttles to once a minute). First run only records what's there — no burst of old replies.
 * Never notifies while a match is recording.
 */
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRosterHubBadge } from '../../../composables/useRosterHubBadge'
import { openAnalysisVodReview } from '../../../lib/open-vod-review'
import {
  coachReplies, markRepliesNotified, newReplyIds, readNotifiedReplies, readSeenReplies,
  replySentence, teamBadgeCount, unseenReplies,
} from './roster-flow'
import { refreshStudentHub } from './useStudentHub'

const POLL_MS = 10 * 60_000

export function useCoachReplyWatch() {
  const router = useRouter()
  const { setPendingReviewCount } = useRosterHubBadge()
  let timer: ReturnType<typeof setInterval> | null = null

  async function tick(force = false) {
    const hub = await refreshStudentHub(force)
    if (!hub) return
    const requests = await window.api?.coach?.getReviewRequests?.().catch(() => []) ?? []
    setPendingReviewCount(teamBadgeCount(unseenReplies(hub, readSeenReplies()).length, requests))

    const notified = readNotifiedReplies()
    if (notified.size === 0) {
      markRepliesNotified(coachReplies(hub).map(r => r.reviewId))
      return
    }
    const fresh = newReplyIds(notified, hub)
    if (!fresh.length) return
    markRepliesNotified(fresh)
    const recording = await window.api?.app?.getStatus?.().then(s => !!s?.recording).catch(() => false)
    if (recording || typeof Notification === 'undefined') return
    const reply = coachReplies(hub).find(r => r.reviewId === fresh[0])
    if (!reply) return
    const body = fresh.length > 1 ? `${replySentence(reply)} ${fresh.length - 1} more in Coaches.` : replySentence(reply)
    const n = new Notification('Your coach replied', { body, silent: false })
    n.onclick = async () => {
      window.focus()
      const opened = reply.analysisId != null
        && await openAnalysisVodReview(router, reply.analysisId, { coachNotes: true, source: 'desktop_coach_reply_notification' }).catch(() => false)
      if (!opened) router.push('/rosters').catch(() => {})
    }
  }

  const onFocus = () => { void tick() }
  onMounted(() => {
    void tick(true)
    timer = setInterval(() => { void tick(true) }, POLL_MS)
    window.addEventListener('focus', onFocus)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
    window.removeEventListener('focus', onFocus)
  })
}
