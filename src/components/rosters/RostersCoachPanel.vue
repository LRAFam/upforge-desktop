<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import RosterMatchRow from './RosterMatchRow.vue'
import {
  rosterFormatDate,
  type RosterMatchVisual,
} from '../../lib/roster-match-display'
import { openWebFeature, WEB_BASE } from '../../lib/web-explore-links'
import { pendingTimeline } from '../../stores/pendingTimeline'

type RosterSettings = {
  roster_enabled?: boolean
  roster_is_live?: boolean
  roster_requires_pro?: boolean
  has_active_coach_pro?: boolean
  roster_connect_ready?: boolean
  roster_welcome_message?: string | null
  roster_membership_mode?: 'free' | 'paid'
  roster_membership_price_cents?: number | null
  roster_included_reviews_per_month?: number
  roster_membership_min_price_cents?: number
  roster_member_count?: number
  roster_member_limit?: number | null
  roster_reviews_this_month?: number
  roster_reviews_limit?: number | null
  coach_hub_billing_enabled?: boolean
  pro_price_cents?: number
}

type RosterStudent = {
  student: {
    id: number
    name: string
    riot_name: string | null
    riot_tag: string | null
  }
  games_analysed: number
  open_review_count: number
  joined_at: string | null
  last_active_at: string | null
  top_coaching_tags_30d?: string[]
}

type CoachReview = {
  id: number
  status: string
  student_question?: string | null
  requested_at?: string | null
  analysis_id?: number | null
  user?: { id: number; name: string } | null
  analysis?: (RosterMatchVisual & { id?: number }) | null
}

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  loaded: [payload: { pendingCount: number }]
  toast: [message: string]
}>()

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
const membershipMode = ref<'free' | 'paid'>('paid')
const priceDollars = ref(9.99)
const includedReviews = ref(3)
const settingsOpen = ref(false)

const statusLabel = computed(() => {
  const s = settings.value
  if (!s?.roster_enabled) return 'Closed'
  if (s.roster_is_live) return 'Live'
  return 'Draft'
})

const draftReason = computed(() => {
  const s = settings.value
  if (!s?.roster_enabled || s.roster_is_live) return null
  if (membershipMode.value === 'paid' && !s.roster_connect_ready) {
    return 'Paid community stays Draft until Stripe payouts are set up on the web.'
  }
  if (membershipMode.value === 'free' && s.roster_requires_pro && !s.has_active_coach_pro) {
    return 'Free community stays Draft until Coach Pro is active, or switch to paid.'
  }
  return 'Roster is enabled but not live yet. Finish setup on the web if needed.'
})

const needsSetup = computed(() => Boolean(draftReason.value) || !settings.value?.roster_enabled)

const inviteUrl = computed(() =>
  coachId.value ? `${WEB_BASE}/coaches/${coachId.value}` : '',
)

function syncFormFromSettings(s: RosterSettings) {
  welcome.value = s.roster_welcome_message ?? ''
  membershipMode.value = s.roster_membership_mode === 'free' ? 'free' : 'paid'
  const cents = s.roster_membership_price_cents ?? 999
  priceDollars.value = Math.round(cents) / 100
  includedReviews.value = s.roster_included_reviews_per_month ?? 3
}

async function load() {
  loading.value = true
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
    syncFormFromSettings(settings.value)
    settingsOpen.value = !settings.value.roster_is_live
    reviews.value = (queue ?? []).map((r) => {
      const row = r as CoachReview
      const analysisId = row.analysis_id ?? row.analysis?.id ?? null
      return { ...row, analysis_id: analysisId }
    })
    emit('loaded', {
      pendingCount: reviews.value.filter(r => r.status === 'pending' || r.status === 'in_progress').length,
    })
  } catch (e) {
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
      await router.push({ path: '/vod-review', query: { timelineId: String(id) } })
      return
    }
  } catch {
    /* fall through */
  }
  await openReviewFeed(review.id)
}

function studentSubtitle(entry: RosterStudent): string {
  const parts = [`${entry.games_analysed} analysed`]
  if (entry.open_review_count > 0) parts.push(`${entry.open_review_count} open`)
  if (entry.last_active_at) parts.push(`active ${rosterFormatDate(entry.last_active_at)}`)
  return parts.join(' · ')
}

function reviewSubtitle(review: CoachReview): string {
  const parts = [
    review.user?.name || 'Student',
    review.status === 'in_progress' ? 'In progress' : 'Pending',
  ]
  if (review.requested_at) parts.push(rosterFormatDate(review.requested_at))
  return parts.join(' · ')
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

defineExpose({ load })
</script>

<template>
  <div class="space-y-5">
    <div v-if="loading" class="space-y-3">
      <div class="h-14 rounded-xl border border-white/[0.07] bg-white/[0.02] animate-pulse" />
      <div v-for="i in 3" :key="i" class="h-14 rounded-xl border border-white/[0.07] bg-white/[0.02] animate-pulse" />
    </div>

    <div
      v-else-if="error"
      class="rounded-xl border border-red-500/25 bg-red-500/[0.08] px-4 py-3 text-sm text-red-200"
    >
      {{ error }}
      <button type="button" class="ml-3 underline" @click="load">Retry</button>
    </div>

    <template v-else-if="settings">
      <!-- Compact status strip -->
      <div class="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span
              class="text-[10px] font-bold uppercase tracking-wide"
              :class="statusLabel === 'Live' ? 'text-emerald-400' : statusLabel === 'Draft' ? 'text-amber-300' : 'text-gray-500'"
            >
              {{ statusLabel }}
            </span>
            <span class="text-[11px] text-gray-500 truncate">{{ coachName }}</span>
          </div>
          <p class="text-[11px] text-gray-600 mt-0.5 tabular-nums">
            {{ students.length }} members
            <span class="text-gray-700">·</span>
            {{ reviews.length }} in queue
            <span class="text-gray-700">·</span>
            {{ settings.roster_reviews_this_month ?? 0 }}<template v-if="settings.roster_reviews_limit">/{{ settings.roster_reviews_limit }}</template> this month
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[11px] font-semibold text-gray-300 hover:bg-white/[0.05]"
          @click="copyInvite"
        >
          Copy invite
        </button>
        <button
          type="button"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40"
          :class="settings.roster_enabled ? 'bg-red-600' : 'bg-zinc-700'"
          :disabled="saving"
          :title="settings.roster_enabled ? 'Close roster' : 'Enable roster'"
          @click="toggleEnabled"
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            :class="settings.roster_enabled ? 'translate-x-6' : 'translate-x-1'"
          />
        </button>
      </div>

      <p
        v-if="draftReason"
        class="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-100/90 leading-relaxed"
      >
        {{ draftReason }}
        <button
          v-if="membershipMode === 'paid' && !settings.roster_connect_ready"
          type="button"
          class="ml-1 font-semibold text-amber-200 underline"
          @click="openPayouts"
        >
          Set up payouts
        </button>
        <button
          v-else-if="membershipMode === 'free' && settings.roster_requires_pro && !settings.has_active_coach_pro"
          type="button"
          class="ml-1 font-semibold text-amber-200 underline"
          @click="openPro"
        >
          Open Coach Pro
        </button>
      </p>

      <!-- Queue first: daily job -->
      <section class="space-y-2">
        <div class="flex items-center gap-2">
          <h2 class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Needs review
          </h2>
          <span v-if="reviews.length" class="text-[11px] tabular-nums text-amber-300/90">{{ reviews.length }}</span>
          <div class="flex-1 h-px bg-white/[0.06]" />
          <button
            type="button"
            class="text-[11px] font-semibold text-gray-500 hover:text-gray-300"
            @click="openReviewFeed()"
          >
            Full feed
          </button>
        </div>
        <p v-if="!reviews.length" class="text-[12px] text-gray-500 py-1">
          Queue is clear. Students send matches from their Rosters tab or post-game.
        </p>
        <RosterMatchRow
          v-for="review in reviews"
          :key="review.id"
          :match="(review.analysis ?? { map: null, agent: null }) as RosterMatchVisual"
          :subtitle="reviewSubtitle(review)"
          tone="pending"
          show-action
          action-label="Annotate"
          action-title="Open review feed to add notes and complete"
          @open="openAnalysis(review)"
          @action="openReviewFeed(review.id)"
        />
      </section>

      <!-- Members -->
      <section class="space-y-2">
        <div class="flex items-center gap-2">
          <h2 class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            Members
          </h2>
          <span class="text-[11px] tabular-nums text-gray-600">{{ students.length }}</span>
          <div class="flex-1 h-px bg-white/[0.06]" />
        </div>
        <p v-if="!students.length" class="text-[12px] text-gray-500 py-1">
          Share your invite link so players can join.
        </p>
        <div
          v-for="entry in students"
          :key="entry.student.id"
          class="flex items-center gap-3 rounded-xl border border-white/[0.07] px-3 py-2.5"
        >
          <div
            class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-xs font-bold text-gray-300"
          >
            {{ entry.student.name.slice(0, 1).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-white truncate">{{ entry.student.name }}</p>
            <p class="text-[11px] text-gray-500 truncate">
              <span v-if="entry.student.riot_name" class="font-mono">
                {{ entry.student.riot_name }}#{{ entry.student.riot_tag }}
              </span>
              <span v-else>Riot n/a</span>
              <span class="text-gray-700"> · </span>
              {{ studentSubtitle(entry) }}
            </p>
          </div>
          <span
            v-if="entry.open_review_count > 0"
            class="flex-shrink-0 text-[10px] font-semibold tabular-nums text-amber-300/90"
          >
            {{ entry.open_review_count }} open
          </span>
        </div>
      </section>

      <!-- Settings: collapsed when live -->
      <section class="rounded-xl border border-white/[0.08] overflow-hidden">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]"
          @click="settingsOpen = !settingsOpen"
        >
          <div>
            <p class="text-[12px] font-semibold text-gray-200">Community settings</p>
            <p class="text-[11px] text-gray-600">
              {{ membershipMode === 'paid' ? `Paid · $${priceDollars}/mo` : 'Free' }}
              · {{ includedReviews }} reviews/mo
              <template v-if="needsSetup"> · needs setup</template>
            </p>
          </div>
          <span class="text-gray-500 text-xs">{{ settingsOpen ? 'Hide' : 'Edit' }}</span>
        </button>

        <div v-if="settingsOpen" class="border-t border-white/[0.06] px-3 py-3 space-y-3 bg-black/20">
          <div v-if="settings.roster_enabled" class="flex gap-2">
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-[11px] font-semibold border transition-colors"
              :class="membershipMode === 'paid'
                ? 'border-white/20 bg-white/[0.08] text-white'
                : 'border-white/[0.08] text-gray-500 hover:text-gray-300'"
              @click="membershipMode = 'paid'"
            >
              Paid
            </button>
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-[11px] font-semibold border transition-colors"
              :class="membershipMode === 'free'
                ? 'border-white/20 bg-white/[0.08] text-white'
                : 'border-white/[0.08] text-gray-500 hover:text-gray-300'"
              @click="membershipMode = 'free'"
            >
              Free
            </button>
          </div>

          <div v-if="settings.roster_enabled && membershipMode === 'paid'" class="grid grid-cols-2 gap-3">
            <label class="block text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              Price / month (USD)
              <input
                v-model.number="priceDollars"
                type="number"
                min="5"
                step="0.01"
                class="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-sm text-white"
              />
            </label>
            <label class="block text-[10px] font-semibold uppercase tracking-wider text-gray-600">
              Reviews / month
              <input
                v-model.number="includedReviews"
                type="number"
                min="1"
                max="20"
                class="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-sm text-white"
              />
            </label>
          </div>

          <label v-if="settings.roster_enabled" class="block text-[10px] font-semibold uppercase tracking-wider text-gray-600">
            Welcome message
            <textarea
              v-model="welcome"
              rows="2"
              maxlength="500"
              class="mt-1 w-full rounded-lg border border-white/[0.08] bg-black/40 px-2.5 py-1.5 text-sm text-white placeholder:text-gray-600"
              placeholder="What students should expect after joining"
            />
          </label>

          <div class="flex flex-wrap gap-2">
            <button
              v-if="settings.roster_enabled"
              type="button"
              class="rounded-lg bg-white/[0.08] hover:bg-white/[0.12] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
              :disabled="saving"
              @click="savePricing"
            >
              {{ saving ? 'Saving…' : 'Save' }}
            </button>
            <button
              type="button"
              class="rounded-lg border border-white/[0.08] px-3 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-gray-200"
              @click="openPayouts"
            >
              Open on web
            </button>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
