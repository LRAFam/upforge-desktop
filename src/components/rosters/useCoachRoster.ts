/**
 * Coach side of Rosters: state + actions, moved unchanged out of RostersCoachPanel.vue so the old
 * markup and the v3 view (CoachRosterV3) share one instance. Same IPC calls, same toasts, same routes.
 */
import { computed, onMounted, ref, watch, type InjectionKey } from 'vue'
import { useRouter } from 'vue-router'
import { openWebFeature, WEB_BASE } from '../../lib/web-explore-links'
import { pendingTimeline } from '../../stores/pendingTimeline'
import { uiV3 } from '../../lib/ui-v3'
import { readCache, writeCache } from '../../lib/stale-cache'
import {
  coachReviewSubtitle,
  normalizeQueue,
  openQueueCount,
  rosterDraftFix,
  rosterDraftReason,
  rosterForm,
  rosterStatus,
  studentSubtitle,
  type CoachReview,
  type MembershipMode,
  type RosterSettings,
  type RosterStudent,
} from './coach-roster'

export type CoachRosterEmit = {
  (e: 'loaded', payload: { pendingCount: number }): void
  (e: 'toast', message: string): void
}

export function useCoachRoster(props: { active: boolean }, emit: CoachRosterEmit) {
  const router = useRouter()

  const loading = ref(true)
  const error = ref<string | null>(null)
  const saving = ref(false)
  const coachId = ref<number | null>(null)
  const coachName = ref('')
  const settings = ref<RosterSettings | null>(null)
  const students = ref<RosterStudent[]>([])
  const reviews = ref<CoachReview[]>([])

  const welcome = ref('')
  const membershipMode = ref<MembershipMode>('paid')
  const priceDollars = ref(9.99)
  const includedReviews = ref(3)
  const settingsOpen = ref(false)

  const statusLabel = computed(() => rosterStatus(settings.value))
  const draftReason = computed(() => rosterDraftReason(settings.value, membershipMode.value))
  const draftFix = computed(() => rosterDraftFix(settings.value, membershipMode.value))
  const needsSetup = computed(() => Boolean(draftReason.value) || !settings.value?.roster_enabled)

  const inviteUrl = computed(() =>
    coachId.value ? `${WEB_BASE}/coaches/${coachId.value}` : '',
  )

  function syncFormFromSettings(s: RosterSettings) {
    const f = rosterForm(s)
    welcome.value = f.welcome
    membershipMode.value = f.mode
    priceDollars.value = f.priceDollars
    includedReviews.value = f.includedReviews
  }

  /** UI v3 coach-side snapshot, drawn instantly on repeat visits. */
  interface CoachRosterSnapshot { coachId: number; coachName: string; settings: RosterSettings; students: RosterStudent[]; reviews: typeof reviews.value }
  const COACH_CACHE_KEY = 'rosters:coach'
  if (uiV3.value) {
    const hit = readCache<CoachRosterSnapshot>(COACH_CACHE_KEY)
    if (hit) {
      coachId.value = hit.value.coachId
      coachName.value = hit.value.coachName
      settings.value = hit.value.settings
      students.value = hit.value.students ?? []
      reviews.value = hit.value.reviews ?? []
      syncFormFromSettings(hit.value.settings)
      settingsOpen.value = !hit.value.settings.roster_is_live
      loading.value = false
    }
  }

  async function load() {
    // v3: reloading over data already on screen stays quiet and leaves the settings form alone.
    const quiet = uiV3.value && settings.value != null
    loading.value = !quiet
    error.value = null
    try {
      const [roster, queue] = await Promise.all([
        window.api.coach.getRoster(),
        window.api.coach.getReviewRequests(),
      ])
      if (!roster) {
        error.value = 'Coach roster not available for this account.'
        students.value = []
        reviews.value = []
        settings.value = null
        emit('loaded', { pendingCount: 0 })
        return
      }
      coachId.value = roster.coach.id
      coachName.value = roster.coach.display_name
      settings.value = roster.settings as RosterSettings
      students.value = (roster.students ?? []) as RosterStudent[]
      if (!quiet) {
        syncFormFromSettings(settings.value)
        settingsOpen.value = !settings.value.roster_is_live
      }
      reviews.value = normalizeQueue(queue)
      if (uiV3.value && coachId.value != null) {
        writeCache<CoachRosterSnapshot>(COACH_CACHE_KEY, { coachId: coachId.value, coachName: coachName.value, settings: settings.value, students: students.value, reviews: reviews.value })
      }
      emit('loaded', { pendingCount: openQueueCount(reviews.value) })
    } catch (e) {
      if (quiet) return
      error.value = e instanceof Error ? e.message : 'Failed to load coach roster'
      emit('loaded', { pendingCount: 0 })
    } finally {
      loading.value = false
    }
  }

  async function toggleEnabled() {
    if (!settings.value || saving.value) return
    saving.value = true
    try {
      const next = !settings.value.roster_enabled
      const res = await window.api.coach.updateRosterSettings({ roster_enabled: next })
      if (!res.ok) {
        emit('toast', res.error)
        return
      }
      settings.value = res.settings as RosterSettings
      syncFormFromSettings(settings.value)
      settingsOpen.value = !settings.value.roster_is_live
      emit('toast', next ? 'Roster enabled' : 'Roster closed')
    } finally {
      saving.value = false
    }
  }

  async function savePricing() {
    if (saving.value) return
    saving.value = true
    try {
      const cents = Math.round(priceDollars.value * 100)
      const res = await window.api.coach.updateRosterSettings({
        roster_membership_mode: membershipMode.value,
        roster_membership_price_cents: membershipMode.value === 'paid' ? cents : undefined,
        roster_included_reviews_per_month: includedReviews.value,
        roster_welcome_message: welcome.value.trim() || null,
      })
      if (!res.ok) {
        emit('toast', res.error)
        return
      }
      settings.value = res.settings as RosterSettings
      syncFormFromSettings(settings.value)
      emit('toast', 'Community settings saved')
    } finally {
      saving.value = false
    }
  }

  async function copyInvite() {
    if (!inviteUrl.value) return
    try {
      await navigator.clipboard.writeText(inviteUrl.value)
      emit('toast', 'Invite link copied')
    } catch {
      emit('toast', inviteUrl.value)
    }
  }

  async function openPayouts() {
    await openWebFeature('/coach-dashboard/roster', true)
  }

  async function openPro() {
    await openWebFeature('/coach-dashboard/roster', true)
  }

  async function openReviewFeed(reviewId?: number) {
    const path = reviewId
      ? `/coach-dashboard/reviews/feed?review=${reviewId}`
      : '/coach-dashboard/reviews/feed'
    await openWebFeature(path, true)
  }

  async function openAnalysis(review: CoachReview) {
    const id = review.analysis_id ?? review.analysis?.id
    if (!id) {
      await openReviewFeed(review.id)
      return
    }
    try {
      if (review.status === 'pending') {
        await window.api.coach.startReview(review.id)
      }
    } catch {
      /* still try to open */
    }
    try {
      const data = await window.api.analyses.getTimeline(id)
      if (data) {
        pendingTimeline.value = data
        // coachReviewId opens the coach notes editor on the v3 match page (ignored by the old page).
        await router.push({ path: '/vod-review', query: { timelineId: String(id), coachReviewId: String(review.id) } })
        return
      }
    } catch {
      /* fall through */
    }
    await openReviewFeed(review.id)
  }

  watch(
    () => props.active,
    (on) => {
      if (on) void load()
    },
  )

  onMounted(() => {
    if (props.active) void load()
  })

  return {
    loading, error, saving, coachId, coachName, settings, students, reviews,
    welcome, membershipMode, priceDollars, includedReviews, settingsOpen,
    statusLabel, draftReason, draftFix, needsSetup, inviteUrl,
    load, toggleEnabled, savePricing, copyInvite, openPayouts, openPro, openReviewFeed, openAnalysis,
    studentSubtitle, reviewSubtitle: coachReviewSubtitle,
  }
}

export type CoachRoster = ReturnType<typeof useCoachRoster>
/** The panel provides its instance; CoachRosterV3 injects it (one load, one state). */
export const coachRosterKey: InjectionKey<CoachRoster> = Symbol('coachRoster')
