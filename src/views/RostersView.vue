<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import RosterMatchRow from '../components/rosters/RosterMatchRow.vue'
import RosterSendSheet from '../components/rosters/RosterSendSheet.vue'
import RostersCoachPanel from '../components/rosters/RostersCoachPanel.vue'
import { useRosterHubBadge } from '../composables/useRosterHubBadge'
import {
  rosterFormatDate,
  rosterMapLabel,
  type RosterMatchVisual,
} from '../lib/roster-match-display'
import { openWebFeature, WEB_BASE } from '../lib/web-explore-links'
import { getRankIconUrl } from '../lib/valorant'

type RosterMode = 'student' | 'coach'

const MODE_KEY = 'upforge.rosters.mode'

type RosterCoach = {
  coach_id: number
  display_name: string
  avatar_url: string | null
  current_rank: string | null
  specialties: string[]
  roster_is_live?: boolean
  can_request_review?: boolean
  can_request_code?: string | null
  can_request_reason?: string | null
  open_review_count?: number
  completed_review_count?: number
  roster_membership_mode?: 'free' | 'paid'
  membership_is_paid?: boolean
  review_limits?: {
    active_reviews: number
    active_reviews_limit: number
    reviews_this_month: number
    reviews_month_limit: number
  }
}

type HubReview = {
  id: number
  status: string
  requested_at?: string | null
  completed_at?: string | null
  coach?: { id: number; display_name: string; avatar_url?: string | null } | null
  analysis?: RosterMatchVisual & { id: number } | null
}

type ActionableMatch = RosterMatchVisual & {
  id: number
  available_coach_ids?: number[]
}

const router = useRouter()
const { setPendingReviewCount } = useRosterHubBadge()

const loading = ref(true)
const error = ref<string | null>(null)
const isCoachAccount = ref(false)
const mode = ref<RosterMode>('student')
const coaches = ref<RosterCoach[]>([])
const pendingReviews = ref<HubReview[]>([])
const completedReviews = ref<HubReview[]>([])
const actionable = ref<ActionableMatch[]>([])
const stats = ref({
  coaches_count: 0,
  pending_reviews: 0,
  completed_reviews: 0,
  actionable_matches: 0,
})
const sendingId = ref<number | null>(null)
const sendError = ref<string | null>(null)
const discoveryOpened = ref(false)
const toast = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const sendSheetOpen = ref(false)
const sendTarget = ref<ActionableMatch | null>(null)
const coachPanelRef = ref<{ load: () => Promise<void> } | null>(null)
const studentPending = ref(0)
const coachPending = ref(0)

const showModeSwitch = computed(() => isCoachAccount.value)
const isEmpty = computed(() => !loading.value && !error.value && coaches.value.length === 0)
const canSendAnyReview = computed(() => coaches.value.some(c => c.can_request_review !== false))

function readStoredMode(): RosterMode | null {
  try {
    const v = localStorage.getItem(MODE_KEY)
    return v === 'coach' || v === 'student' ? v : null
  } catch {
    return null
  }
}

function setMode(next: RosterMode) {
  mode.value = next
  try {
    localStorage.setItem(MODE_KEY, next)
  } catch {
    /* ignore */
  }
  refreshBadge()
}

function refreshBadge() {
  setPendingReviewCount(studentPending.value + coachPending.value)
}

const sendBlockMessage = computed(() => {
  if (canSendAnyReview.value) return null
  const codes = coaches.value
    .filter(c => c.can_request_review === false)
    .map(c => coachBlock(c).code)
  if (codes.every(c => c === 'student_active_limit')) {
    return 'You already have a review in progress. Wait for your coach to finish, then send another.'
  }
  if (codes.every(c => c === 'student_monthly_limit')) {
    return 'You have used all roster reviews with your coach this month.'
  }
  const reason = coaches.value.find(c => c.can_request_reason)?.can_request_reason
  return reason || 'You cannot send a review right now.'
})

function coachBlock(coach: RosterCoach): { label: string | null; code: string | null } {
  if (coach.can_request_review !== false) return { label: null, code: null }

  const code = coach.can_request_code
    ?? (() => {
      const lim = coach.review_limits
      if (lim && lim.active_reviews >= lim.active_reviews_limit) return 'student_active_limit'
      if (lim && lim.reviews_this_month >= lim.reviews_month_limit) return 'student_monthly_limit'
      if (coach.roster_is_live === false) return 'roster_closed'
      return null
    })()

  if (code === 'student_active_limit') {
    const open = coach.review_limits?.active_reviews ?? coach.open_review_count ?? 1
    return {
      label: open <= 1 ? 'Waiting on coach' : `${open} open`,
      code,
    }
  }
  if (code === 'student_monthly_limit') return { label: 'Monthly limit', code }
  if (code === 'roster_closed' || code === 'roster_not_ready' || code === 'coach_pro_required') {
    return { label: 'Not accepting', code }
  }
  if (code === 'coach_monthly_limit') return { label: 'Coach at capacity', code }
  if (code === 'membership_required') return { label: 'Join required', code }
  return { label: 'Unavailable', code }
}

const sendEligibleCoaches = computed(() => {
  const ids = sendTarget.value?.available_coach_ids
  const pool = coaches.value.filter(c => c.can_request_review !== false)
  if (!ids?.length) return pool
  const allowed = new Set(ids)
  return pool.filter(c => allowed.has(c.coach_id))
})

const sendMatchLabel = computed(() => {
  const m = sendTarget.value
  if (!m) return 'Match'
  const agent = m.agent || rosterMapLabel(m)
  const map = rosterMapLabel(m)
  return m.agent ? `${agent} · ${map}` : map
})

function flashToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = null }, 3200)
}

async function load() {
  loading.value = true
  error.value = null
  sendError.value = null
  try {
    const [hub, roster] = await Promise.all([
      window.api.coach.getStudentHub(),
      window.api.coach.getRoster().catch(() => null),
    ])
    isCoachAccount.value = Boolean(roster?.coach?.id)

    coaches.value = (hub?.coaches ?? []) as RosterCoach[]
    pendingReviews.value = (hub?.pending_reviews ?? []) as HubReview[]
    completedReviews.value = (hub?.recent_completed ?? []) as HubReview[]
    actionable.value = (hub?.actionable_analyses ?? []) as ActionableMatch[]
    stats.value = hub?.stats ?? {
      coaches_count: 0,
      pending_reviews: 0,
      completed_reviews: 0,
      actionable_matches: 0,
    }
    studentPending.value = stats.value.pending_reviews

    const stored = readStoredMode()
    if (isCoachAccount.value && coaches.value.length === 0) {
      setMode('coach')
    } else if (isCoachAccount.value && stored) {
      setMode(stored)
    } else if (isCoachAccount.value && !stored) {
      setMode('coach')
    } else {
      setMode('student')
    }

    if (mode.value === 'coach' && coachPanelRef.value) {
      await coachPanelRef.value.load()
    } else {
      refreshBadge()
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load rosters'
    coaches.value = []
    pendingReviews.value = []
    completedReviews.value = []
    actionable.value = []
    studentPending.value = 0
    setPendingReviewCount(0)
  } finally {
    loading.value = false
  }
}

function onCoachLoaded(payload: { pendingCount: number }) {
  coachPending.value = payload.pendingCount
  refreshBadge()
}

async function refreshCurrent() {
  if (mode.value === 'coach') {
    await coachPanelRef.value?.load()
    return
  }
  await load()
}

async function openDiscovery() {
  discoveryOpened.value = true
  try {
    sessionStorage.setItem('upforge.rosters.discoveryOpened', '1')
  } catch {
    /* ignore */
  }
  await openWebFeature('/coaches', true)
}

async function openMyCoachesWeb() {
  await openWebFeature('/my-coaches', true)
}

async function openCoachProfile(coachId: number) {
  await openWebFeature(`/coaches/${coachId}`, true)
}

function membershipLabel(coach: RosterCoach): string {
  if (coach.membership_is_paid || coach.roster_membership_mode === 'paid') return 'Paid'
  return 'Free'
}

function statusLabel(status: string): string {
  if (status === 'in_progress') return 'In progress'
  if (status === 'completed') return 'Done'
  return 'Pending'
}

function monthLimitPct(coach: RosterCoach): number | null {
  const lim = coach.review_limits
  if (!lim || !lim.reviews_month_limit) return null
  return Math.min(100, Math.round((lim.reviews_this_month / lim.reviews_month_limit) * 100))
}

function openAnalysis(row: RosterMatchVisual & { id?: number }) {
  const analysisId = row.id
  if (!analysisId) return
  const game = row.game_type || 'valorant'
  if (game === 'valorant') {
    router.push({ path: '/vod-review', query: { id: String(analysisId) } }).catch(() => {})
    return
  }
  void openWebFeature(`/${game}/results/${analysisId}`, true)
}

function openNotes(review: HubReview) {
  if (!review.analysis?.id) return
  openAnalysis(review.analysis)
}

function beginSend(match: ActionableMatch) {
  if (!canSendAnyReview.value) {
    sendError.value = sendBlockMessage.value || 'You cannot send a review right now.'
    return
  }
  sendTarget.value = match
  sendSheetOpen.value = true
  sendError.value = null
}

function closeSendSheet() {
  if (sendingId.value != null) return
  sendSheetOpen.value = false
  sendTarget.value = null
}

async function confirmSend(payload: { coachId: number; question?: string }) {
  const match = sendTarget.value
  if (!match) return
  sendingId.value = match.id
  sendError.value = null
  try {
    const res = await window.api.coach.requestRosterReview({
      analysisId: match.id,
      coachId: payload.coachId,
      question: payload.question,
    })
    if (!res.ok) {
      sendError.value = res.error || 'Could not send review request'
      return
    }
    const coachName = coaches.value.find(c => c.coach_id === payload.coachId)?.display_name || 'your coach'
    flashToast(`Sent to ${coachName}`)
    sendSheetOpen.value = false
    sendTarget.value = null
    await load()
  } finally {
    sendingId.value = null
  }
}

function reviewSubtitle(review: HubReview): string {
  const parts = [rosterMapLabel(review.analysis ?? {})]
  if (review.analysis?.rounds_won != null && review.analysis?.rounds_lost != null) {
    parts.push(`${review.analysis.rounds_won}–${review.analysis.rounds_lost}`)
  }
  parts.push(review.coach?.display_name || 'Coach')
  parts.push(statusLabel(review.status))
  return parts.join(' · ')
}

function completedSubtitle(review: HubReview): string {
  const parts = [rosterMapLabel(review.analysis ?? {})]
  if (review.analysis?.rounds_won != null && review.analysis?.rounds_lost != null) {
    parts.push(`${review.analysis.rounds_won}–${review.analysis.rounds_lost}`)
  }
  parts.push(review.coach?.display_name || 'Coach')
  if (review.completed_at) parts.push(rosterFormatDate(review.completed_at))
  return parts.join(' · ')
}

async function boot() {
  await load()
  if (mode.value === 'coach') return
  if (!isEmpty.value || error.value) return
  let alreadyOpened = false
  try {
    alreadyOpened = sessionStorage.getItem('upforge.rosters.discoveryOpened') === '1'
  } catch {
    alreadyOpened = discoveryOpened.value
  }
  if (!alreadyOpened) {
    await openDiscovery()
  }
}

onMounted(() => {
  void boot()
  const onFocus = () => {
    if (!loading.value) void refreshCurrent()
  }
  window.addEventListener('focus', onFocus)
  onUnmounted(() => {
    window.removeEventListener('focus', onFocus)
    if (toastTimer) clearTimeout(toastTimer)
  })
})
</script>

<template>
  <div class="rosters-view flex flex-1 min-h-0 flex-col overflow-hidden bg-[#111111] text-white">
    <Transition name="toast-slide">
      <div
        v-if="toast"
        class="fixed right-5 bottom-5 z-[90] flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-[#121212] px-4 py-2.5 text-sm text-white shadow-xl pointer-events-none"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {{ toast }}
      </div>
    </Transition>

    <div class="flex-shrink-0 border-b border-white/[0.08] px-4 py-3">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Rosters</p>
          <h1 class="text-xl font-black tracking-tight text-white">
            {{ mode === 'coach' ? 'Your community' : 'Your coaches' }}
          </h1>
          <p class="text-[11px] text-gray-500 mt-0.5 hidden sm:block">
            {{ mode === 'coach'
              ? 'Clear the queue, then grow membership.'
              : 'Send matches and read notes when they land.' }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2 items-center">
          <div
            v-if="showModeSwitch"
            class="flex rounded-lg border border-white/[0.1] bg-[#0c0c0c] p-0.5"
          >
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors"
              :class="mode === 'coach' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'"
              @click="setMode('coach')"
            >
              Coach
              <span v-if="coachPending" class="ml-1 tabular-nums text-amber-300">{{ coachPending }}</span>
            </button>
            <button
              type="button"
              class="rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors"
              :class="mode === 'student' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'"
              @click="setMode('student')"
            >
              Student
              <span v-if="studentPending" class="ml-1 tabular-nums text-amber-300">{{ studentPending }}</span>
            </button>
          </div>
          <button
            type="button"
            class="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200 hover:bg-white/[0.05] transition-colors"
            @click="refreshCurrent"
          >
            Refresh
          </button>
          <button
            v-if="mode === 'student'"
            type="button"
            class="rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-gray-300 hover:text-white hover:bg-white/[0.07] transition-colors"
            @click="openDiscovery"
          >
            Browse communities
          </button>
        </div>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <RostersCoachPanel
          v-show="mode === 'coach'"
          ref="coachPanelRef"
          :active="mode === 'coach'"
          @loaded="onCoachLoaded"
          @toast="flashToast"
        />

        <template v-if="mode === 'student'">
        <div v-if="loading" class="space-y-3">
          <div class="h-16 dash-panel animate-pulse" />
          <div v-for="i in 4" :key="i" class="h-14 rounded-xl border border-white/[0.07] bg-white/[0.02] animate-pulse" />
        </div>

        <div
          v-else-if="error"
          class="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-200"
        >
          {{ error }}
          <button type="button" class="ml-3 underline" @click="load">Retry</button>
        </div>

        <section
          v-else-if="isEmpty"
          class="dash-panel px-6 py-10 text-center space-y-4"
        >
          <div class="mx-auto h-12 w-12 rounded-2xl border border-white/[0.10] bg-white/[0.03] flex items-center justify-center">
            <svg class="h-6 w-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M17 20v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8zM23 20v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <p class="text-lg font-bold text-white">Join a coach community</p>
          <p class="text-sm text-gray-400 max-w-md mx-auto">
            Free and paid rosters are labeled on each profile. After you join, send matches from here
            and read notes when they land.
          </p>
          <div class="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              class="rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/[0.1]"
              @click="openDiscovery"
            >
              {{ discoveryOpened ? 'Reopen discovery' : 'Find a community' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/10 px-4 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/[0.05]"
              @click="load"
            >
              Refresh
            </button>
          </div>
        </section>

        <template v-else>
          <div class="dash-panel flex overflow-hidden flex-shrink-0">
            <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5 px-2 border-r border-white/[0.06]">
              <span class="text-sm font-black tabular-nums text-white">{{ stats.coaches_count }}</span>
              <span class="text-[8px] text-gray-600 uppercase tracking-wide">Coaches</span>
            </div>
            <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5 px-2 border-r border-white/[0.06]">
              <span class="text-sm font-black tabular-nums text-amber-300">{{ stats.pending_reviews }}</span>
              <span class="text-[8px] text-gray-600 uppercase tracking-wide">Pending</span>
            </div>
            <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5 px-2 border-r border-white/[0.06]">
              <span class="text-sm font-black tabular-nums text-emerald-300">{{ stats.completed_reviews }}</span>
              <span class="text-[8px] text-gray-600 uppercase tracking-wide">Completed</span>
            </div>
            <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5 px-2">
              <span class="text-sm font-black tabular-nums text-white">{{ stats.actionable_matches }}</span>
              <span class="text-[8px] text-gray-600 uppercase tracking-wide">Ready</span>
            </div>
          </div>

          <section class="space-y-2">
            <div class="flex items-center gap-2 px-0.5">
              <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Your coaches</span>
              <div class="flex-1 h-px bg-gradient-to-r from-white/[0.1] via-white/[0.04] to-transparent" />
              <button
                type="button"
                class="text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-gray-300"
                @click="openDiscovery"
              >
                Find another
              </button>
            </div>

            <button
              v-for="coach in coaches"
              :key="coach.coach_id"
              type="button"
              class="w-full text-left dash-panel px-3 py-3 hover:bg-white/[0.03] transition-colors"
              @click="openCoachProfile(coach.coach_id)"
            >
              <div class="flex items-center gap-3">
                <div
                  class="relative h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center text-sm font-bold text-white overflow-hidden border border-white/10 flex-shrink-0"
                >
                  <img
                    v-if="coach.avatar_url"
                    :src="coach.avatar_url"
                    alt=""
                    class="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                  <span v-else>{{ coach.display_name.slice(0, 1) }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="text-sm font-bold text-white truncate">{{ coach.display_name }}</p>
                    <span
                      class="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      :class="
                        membershipLabel(coach) === 'Paid'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                      "
                    >
                      {{ membershipLabel(coach) }}
                    </span>
                    <span
                      v-if="coachBlock(coach).label"
                      class="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-white/[0.04] text-amber-200/90 border border-amber-500/25"
                      :title="coach.can_request_reason || undefined"
                    >
                      {{ coachBlock(coach).label }}
                    </span>
                    <span
                      v-if="coach.roster_is_live === false"
                      class="text-[9px] font-semibold text-gray-500"
                    >
                      Not live
                    </span>
                  </div>
                  <div class="mt-1 flex items-center gap-1.5 text-[11px] text-gray-500 min-w-0">
                    <img
                      v-if="coach.current_rank && getRankIconUrl(coach.current_rank)"
                      :src="getRankIconUrl(coach.current_rank)!"
                      class="h-4 w-4 object-contain flex-shrink-0"
                      :alt="coach.current_rank"
                      :title="coach.current_rank"
                      loading="lazy"
                      decoding="async"
                    />
                    <span class="truncate">{{ coach.current_rank || 'Rank n/a' }}</span>
                    <span class="text-gray-700">·</span>
                    <span class="flex-shrink-0 tabular-nums">{{ coach.open_review_count ?? 0 }} open</span>
                    <span class="text-gray-700">·</span>
                    <span class="flex-shrink-0 tabular-nums">{{ coach.completed_review_count ?? 0 }} done</span>
                  </div>
                  <div v-if="coach.review_limits" class="mt-2 space-y-1.5">
                    <div>
                      <div class="flex items-center justify-between text-[10px] text-gray-600 mb-1">
                        <span>Open with coach</span>
                        <span class="tabular-nums">
                          {{ coach.review_limits.active_reviews }}/{{ coach.review_limits.active_reviews_limit }}
                        </span>
                      </div>
                      <div class="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all"
                          :class="coach.review_limits.active_reviews >= coach.review_limits.active_reviews_limit ? 'bg-amber-500/80' : 'bg-white/25'"
                          :style="{ width: `${Math.min(100, Math.round((coach.review_limits.active_reviews / Math.max(1, coach.review_limits.active_reviews_limit)) * 100))}%` }"
                        />
                      </div>
                    </div>
                    <div>
                      <div class="flex items-center justify-between text-[10px] text-gray-600 mb-1">
                        <span>This month</span>
                        <span class="tabular-nums">
                          {{ coach.review_limits.reviews_this_month }}/{{ coach.review_limits.reviews_month_limit }}
                        </span>
                      </div>
                      <div class="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all"
                          :class="(monthLimitPct(coach) ?? 0) >= 100 ? 'bg-amber-500/80' : 'bg-white/25'"
                          :style="{ width: `${monthLimitPct(coach) ?? 0}%` }"
                        />
                      </div>
                    </div>
                  </div>
                  <div v-if="coach.specialties?.length" class="mt-2 flex flex-wrap gap-1">
                    <span
                      v-for="tag in coach.specialties.slice(0, 4)"
                      :key="tag"
                      class="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-px text-[9px] font-semibold text-gray-500"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          </section>

          <section v-if="pendingReviews.length" class="space-y-2">
            <div class="flex items-center gap-2 px-0.5">
              <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">With your coach</span>
              <div class="flex-1 h-px bg-gradient-to-r from-white/[0.1] via-white/[0.04] to-transparent" />
            </div>
            <RosterMatchRow
              v-for="review in pendingReviews"
              :key="review.id"
              :match="review.analysis ?? {}"
              :subtitle="reviewSubtitle(review)"
              tone="pending"
              show-action
              action-label="Open"
              @open="openNotes(review)"
              @action="openNotes(review)"
            />
          </section>

          <section v-if="actionable.length" class="space-y-2">
            <div class="flex items-center gap-2 px-0.5">
              <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Send a match</span>
              <div class="flex-1 h-px bg-gradient-to-r from-white/[0.1] via-white/[0.04] to-transparent" />
              <span class="text-[10px] text-gray-700 tabular-nums">{{ actionable.length }}</span>
            </div>
            <p v-if="sendError" class="text-xs text-red-300 px-0.5">{{ sendError }}</p>
            <p
              v-else-if="sendBlockMessage"
              class="text-[11px] text-amber-200/80 px-0.5"
            >
              {{ sendBlockMessage }}
            </p>
            <RosterMatchRow
              v-for="match in actionable"
              :key="match.id"
              :match="match"
              show-action
              action-label="Ask my coach"
              :action-busy="sendingId === match.id"
              :action-disabled="!canSendAnyReview"
              :action-title="canSendAnyReview ? 'Send this match for coach notes' : (sendBlockMessage || 'Cannot send right now')"
              @open="openAnalysis(match)"
              @action="beginSend(match)"
            />
          </section>

          <section v-if="completedReviews.length" class="space-y-2 pb-2">
            <div class="flex items-center gap-2 px-0.5">
              <span class="text-[10px] font-semibold text-gray-600 uppercase tracking-wider">Recent notes</span>
              <div class="flex-1 h-px bg-gradient-to-r from-white/[0.1] via-white/[0.04] to-transparent" />
            </div>
            <RosterMatchRow
              v-for="review in completedReviews"
              :key="review.id"
              :match="review.analysis ?? {}"
              :subtitle="completedSubtitle(review)"
              @open="openNotes(review)"
            >
              <template #badges>
                <span
                  class="inline-flex items-center gap-1 rounded border border-white/[0.1] bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-gray-300"
                >
                  Notes ready
                </span>
              </template>
            </RosterMatchRow>
          </section>

          <p class="text-[10px] text-gray-600 text-center pb-4">
            Manage membership on
            <button type="button" class="text-gray-400 underline" @click="openMyCoachesWeb">
              {{ WEB_BASE.replace('https://', '') }}/my-coaches
            </button>
          </p>
        </template>
        </template>
      </div>
    </div>

    <RosterSendSheet
      :open="sendSheetOpen"
      :match-label="sendMatchLabel"
      :coaches="sendEligibleCoaches"
      :preferred-coach-id="sendTarget?.available_coach_ids?.[0] ?? null"
      :busy="sendingId != null"
      @close="closeSendSheet"
      @send="confirmSend"
    />
  </div>
</template>

<style scoped>
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-slide-enter-from,
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
