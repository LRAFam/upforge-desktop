/**
 * App-wide (mounted once by SidebarV3): keeps the Coaches and Students badges (and whether the
 * Students item shows) current and shows one desktop
 * notification per new coach reply. Polls every 10 minutes and on window focus (the shared hub
 * loader throttles to once a minute). First run only records what's there — no burst of old replies.
 * Never notifies while a match is recording.
 */
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { openAnalysisVodReview } from '../../../lib/open-vod-review'
import {
  coachBadgeCounts, coachReplies, markRepliesNotified, newReplyIds, readNotifiedReplies, readSeenReplies,
  replySentence, replyTitle, unseenReplies,
} from './roster-flow'
import { useCoachBadges } from './useCoachBadges'
import { refreshStudentHub } from './useStudentHub'

const POLL_MS = 10 * 60_000

export function useCoachReplyWatch() {
  const router = useRouter()
  const { setNotesReady, setNeedsNotes, setCoachProfile } = useCoachBadges()
  let timer: ReturnType<typeof setInterval> | null = null

  /** Coach profile → Students nav item. null from the API = no coach profile; a network error keeps the cached answer. */
  async function checkCoachProfile() {
    try {
      const roster = await window.api?.coach?.getRoster?.()
      if (roster !== undefined) setCoachProfile(Boolean(roster?.coach?.id))
    } catch { /* keep cached */ }
  }

  async function tick(force = false) {
    const hub = await refreshStudentHub(force)
    if (!hub) return
    const requests = await window.api?.coach?.getReviewRequests?.().catch(() => []) ?? []
    const counts = coachBadgeCounts(unseenReplies(hub, readSeenReplies()).length, requests)
    setNotesReady(counts.coaches)
    setNeedsNotes(counts.students)

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
    const n = new Notification(replyTitle(reply), { body, silent: false })
    n.onclick = async () => {
      window.focus()
      const opened = reply.analysisId != null
        && await openAnalysisVodReview(router, reply.analysisId, { coachNotes: true, source: 'desktop_coach_reply_notification' }).catch(() => false)
      if (!opened) router.push('/rosters').catch(() => {})
    }
  }

  const onFocus = () => { void tick() }
  onMounted(() => {
    void checkCoachProfile()
    void tick(true)
    timer = setInterval(() => { void tick(true) }, POLL_MS)
    window.addEventListener('focus', onFocus)
  })
  onUnmounted(() => {
    if (timer) clearInterval(timer)
    window.removeEventListener('focus', onFocus)
  })
}
