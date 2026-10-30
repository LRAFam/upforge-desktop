<script setup lang="ts">
/**
 * Coach side of Rosters. Logic lives in `useCoachRoster` (moved unchanged); this file renders the
 * old markup, or `CoachRosterV3` when UI v3 is on. Same `loaded`/`toast` emits and exposed `load`.
 */
import { provide } from 'vue'
import RosterMatchRow from './RosterMatchRow.vue'
import CoachRosterV3 from '../v3/coaches/CoachRosterV3.vue'
import type { RosterMatchVisual } from '../../lib/roster-match-display'
import { uiV3 } from '../../lib/ui-v3'
import { coachRosterKey, useCoachRoster } from './useCoachRoster'

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  loaded: [payload: { pendingCount: number }]
  toast: [message: string]
}>()

const roster = useCoachRoster(props, emit)
provide(coachRosterKey, roster)

const {
  loading, error, saving, coachName, settings, students, reviews,
  welcome, membershipMode, priceDollars, includedReviews, settingsOpen,
  statusLabel, draftReason, needsSetup,
  load, toggleEnabled, savePricing, copyInvite, openPayouts, openPro, openReviewFeed, openAnalysis,
  studentSubtitle, reviewSubtitle,
} = roster

defineExpose({ load })
</script>

<template>
  <CoachRosterV3 v-if="uiV3" />
  <div v-else class="space-y-5">
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
