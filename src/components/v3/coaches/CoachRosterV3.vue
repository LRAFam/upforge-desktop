<script setup lang="ts">
/**
 * Coaches › Coach mode (UI v3). Pure view over the `useCoachRoster` instance that
 * RostersCoachPanel provides — same load, IPC calls, toasts and routes as the old panel.
 * Order: status line + counts · Needs review (queue first) · Members · Community settings.
 */
import { computed, inject } from 'vue'
import UfButton from '../UfButton.vue'
import UfSkeleton from '../UfSkeleton.vue'
import UfStatRow from '../UfStatRow.vue'
import UfTabs from '../UfTabs.vue'
import RosterMatchRowV3 from './RosterMatchRowV3.vue'
import { initial } from './coach-format'
import { coachRosterKey } from '../../rosters/useCoachRoster'
import { riotId, type MembershipMode } from '../../rosters/coach-roster'

const injected = inject(coachRosterKey)
if (!injected) throw new Error('CoachRosterV3 must be rendered inside RostersCoachPanel')
const r = injected

const {
  loading, error, saving, coachName, settings, students, reviews,
  welcome, membershipMode, priceDollars, includedReviews, settingsOpen,
  statusLabel, draftReason, draftFix, needsSetup,
  load, toggleEnabled, savePricing, copyInvite, openPayouts, openPro, openReviewFeed, openAnalysis,
  studentSubtitle, reviewSubtitle,
} = r

const statusColor = computed(() =>
  statusLabel.value === 'Live' ? 'var(--uf-win)' : statusLabel.value === 'Draft' ? 'var(--uf-gold)' : 'var(--uf-faint)',
)

const statItems = computed(() => {
  const s = settings.value
  const month = `${s?.roster_reviews_this_month ?? 0}${s?.roster_reviews_limit ? `/${s.roster_reviews_limit}` : ''}`
  return [
    { value: String(students.value.length), caption: 'Members', sub: 'On your roster' },
    { value: String(reviews.value.length), caption: 'In queue', sub: 'Matches sent to you' },
    { value: month, caption: 'This month', sub: 'Roster reviews' },
  ]
})

const settingsSummary = computed(() => {
  const parts = [membershipMode.value === 'paid' ? `Paid · $${priceDollars.value}/mo` : 'Free', `${includedReviews.value} reviews/mo`]
  if (needsSetup.value) parts.push('needs setup')
  return parts.join(' · ')
})

const modeItems = [{ key: 'paid', label: 'Paid' }, { key: 'free', label: 'Free' }] as const
function setMode(key: string) { membershipMode.value = key as MembershipMode }
</script>

<template>
  <div class="uf-cr">
    <!-- First-ever load: placeholders in the shape of status line, queue rows and member rows. -->
    <div v-if="loading" aria-busy="true" aria-label="Loading your roster" class="uf-cr-skel">
      <UfSkeleton w="40%" :h="15" />
      <UfSkeleton :w="110" :h="12" />
      <div v-for="i in 3" :key="'q' + i" class="uf-cr-skel-row"><UfSkeleton :w="34" :h="34" /><span class="uf-cr-skel-lines"><UfSkeleton w="32%" :h="15" /><UfSkeleton w="48%" :h="13" /></span></div>
      <UfSkeleton :w="110" :h="12" />
      <div v-for="i in 3" :key="'m' + i" class="uf-cr-skel-row"><UfSkeleton :w="34" :h="34" /><span class="uf-cr-skel-lines"><UfSkeleton w="26%" :h="15" /><UfSkeleton w="18%" :h="13" /></span></div>
    </div>

    <div v-else-if="error" class="uf-cr-state">
      <span class="uf-label">Coach roster</span>
      <p class="uf-t3">{{ error }}</p>
      <div><UfButton variant="secondary" @click="load">Try again</UfButton></div>
    </div>

    <template v-else-if="settings">
      <!-- Status line -->
      <section class="uf-cr-status uf-rise">
        <div class="uf-cr-status-text">
          <span class="uf-cr-state-word" :style="{ color: statusColor }">{{ statusLabel }}</span>
          <span class="uf-t4">{{ coachName }}</span>
        </div>
        <div class="uf-cr-status-actions">
          <UfButton variant="secondary" icon="share" @click="copyInvite">Copy invite</UfButton>
          <button type="button" role="switch" class="uf-cr-switch" :aria-checked="!!settings.roster_enabled"
            :disabled="saving" :title="settings.roster_enabled ? 'Close roster' : 'Enable roster'" @click="toggleEnabled">
            <span class="uf-cr-switch-track" :class="{ 'is-on': settings.roster_enabled }"><span class="uf-cr-switch-knob" /></span>
            <span class="uf-cr-switch-label">{{ settings.roster_enabled ? 'Roster open' : 'Roster closed' }}</span>
          </button>
        </div>
      </section>

      <p v-if="draftReason" class="uf-cr-draft">
        {{ draftReason }}
        <UfButton v-if="draftFix === 'payouts'" variant="link" @click="openPayouts">Set up payouts</UfButton>
        <UfButton v-else-if="draftFix === 'pro'" variant="link" @click="openPro">Open Coach Pro</UfButton>
      </p>

      <UfStatRow class="uf-rise uf-d1s" :items="statItems" />

      <!-- Queue first: the daily job -->
      <section>
        <div class="uf-cr-sec-head">
          <span class="uf-label">Needs review<span v-if="reviews.length" class="uf-cr-count">{{ reviews.length }}</span></span>
          <UfButton variant="link" @click="openReviewFeed()">Full feed</UfButton>
        </div>
        <p v-if="!reviews.length" class="uf-t4 uf-cr-empty">Queue is clear. Students send matches from their Rosters tab or post-game.</p>
        <RosterMatchRowV3 v-for="review in reviews" :key="review.id" :match="review.analysis ?? {}"
          :subtitle="reviewSubtitle(review)" @open="openAnalysis(review)">
          <template #action>
            <UfButton variant="secondary" icon="chat" title="Open the match and write notes at the video time" @click="openAnalysis(review)">Write notes</UfButton>
          </template>
        </RosterMatchRowV3>
      </section>

      <!-- Members -->
      <section>
        <div class="uf-cr-sec-head">
          <span class="uf-label">Members<span class="uf-cr-count">{{ students.length }}</span></span>
        </div>
        <p v-if="!students.length" class="uf-t4 uf-cr-empty">Share your invite link so players can join.</p>
        <div v-for="entry in students" :key="entry.student.id" class="uf-cr-member">
          <span class="uf-cr-avatar" aria-hidden="true">{{ initial(entry.student.name) }}</span>
          <span class="uf-cr-member-main">
            <span class="uf-t3">{{ entry.student.name }}</span>
            <span class="uf-t4"><span v-if="riotId(entry)" class="uf-cr-mono">{{ riotId(entry) }}</span><span v-else>Riot n/a</span> · {{ studentSubtitle(entry) }}</span>
          </span>
          <span v-if="entry.open_review_count > 0" class="uf-t4 uf-cr-open">{{ entry.open_review_count }} open</span>
        </div>
      </section>

      <!-- Community settings: collapsed when live -->
      <section class="uf-cr-settings">
        <button type="button" class="uf-cr-settings-head" :aria-expanded="settingsOpen" aria-controls="uf-cr-settings-body" @click="settingsOpen = !settingsOpen">
          <span class="uf-cr-member-main">
            <span class="uf-label">Community settings</span>
            <span class="uf-t4">{{ settingsSummary }}</span>
          </span>
          <span class="uf-t4">{{ settingsOpen ? 'Hide' : 'Edit' }}</span>
        </button>

        <div v-if="settingsOpen" id="uf-cr-settings-body" class="uf-cr-form">
          <UfTabs v-if="settings.roster_enabled" size="filter" label="Membership" :items="modeItems" :model-value="membershipMode" @update:model-value="setMode" />

          <div v-if="settings.roster_enabled && membershipMode === 'paid'" class="uf-cr-grid">
            <label class="uf-cr-field">
              <span class="uf-t4">Price / month (USD)</span>
              <input v-model.number="priceDollars" type="number" min="5" step="0.01" class="uf-cr-input">
            </label>
            <label class="uf-cr-field">
              <span class="uf-t4">Reviews / month</span>
              <input v-model.number="includedReviews" type="number" min="1" max="20" class="uf-cr-input">
            </label>
          </div>

          <label v-if="settings.roster_enabled" class="uf-cr-field">
            <span class="uf-t4">Welcome message</span>
            <textarea v-model="welcome" rows="2" maxlength="500" class="uf-cr-input" placeholder="What students should expect after joining" />
          </label>

          <div class="uf-cr-form-actions">
            <UfButton v-if="settings.roster_enabled" variant="primary" :disabled="saving" @click="savePricing">{{ saving ? 'Saving…' : 'Save' }}</UfButton>
            <UfButton variant="link" @click="openPayouts">Open on web</UfButton>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.uf-cr { display: flex; flex-direction: column; gap: 28px; }
.uf-cr p { margin: 0; }
.uf-cr-skel { display: flex; flex-direction: column; gap: 12px; }
.uf-cr-skel-row { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-cr-skel-lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.uf-cr-state { display: flex; flex-direction: column; gap: 12px; padding: 30px 0; max-width: 720px; }
.uf-cr-status { display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.uf-cr-status-text { display: flex; align-items: baseline; gap: 14px; }
.uf-cr-state-word { font: 600 12px/1.2 var(--uf-body); letter-spacing: 0.12em; text-transform: uppercase; }
.uf-cr-status-actions { display: flex; align-items: center; gap: 18px; }
.uf-cr-switch { display: inline-flex; align-items: center; gap: 10px; background: none; border: 0; padding: 0; cursor: pointer; color: var(--uf-bone); }
.uf-cr-switch:disabled { opacity: 0.45; cursor: not-allowed; }
.uf-cr-switch-track { width: 40px; height: 22px; padding: 3px; display: flex; background: var(--uf-raised); border: 1px solid var(--uf-line-2); transition: background 0.15s ease; }
.uf-cr-switch-track.is-on { background: var(--uf-red); border-color: var(--uf-red); justify-content: flex-end; }
.uf-cr-switch-knob { width: 14px; height: 14px; background: var(--uf-bone); }
.uf-cr-switch-label { font: 600 13px/1 var(--uf-body); }
.uf-cr-draft { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; font: 400 13px/1.4 var(--uf-body); color: var(--uf-gold); padding-left: 12px; border-left: 2px solid var(--uf-gold); }
.uf-cr-sec-head { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 8px; }
.uf-cr-count { margin-left: 10px; color: var(--uf-muted); font-variant-numeric: tabular-nums; }
.uf-cr-empty { padding: 12px 0; border-top: 1px solid var(--uf-line); }
.uf-cr-member { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--uf-line); }
.uf-cr-avatar { width: 36px; height: 36px; flex: none; display: flex; align-items: center; justify-content: center; background: var(--uf-raised); font: 700 16px/1 var(--uf-display); color: var(--uf-bone); }
.uf-cr-member-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.uf-cr-member-main > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-cr-mono { font-variant-numeric: tabular-nums; color: var(--uf-muted); }
.uf-cr-open { color: var(--uf-muted); font-variant-numeric: tabular-nums; }
.uf-cr-settings { border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.uf-cr-settings-head { width: 100%; display: flex; align-items: center; gap: 16px; padding: 14px 0; background: none; border: 0; color: inherit; cursor: pointer; text-align: left; }
.uf-cr-settings-head:hover .uf-t4:last-child { color: var(--uf-bone); }
.uf-cr-form { display: flex; flex-direction: column; gap: 18px; padding: 4px 0 20px; max-width: 640px; }
.uf-cr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
.uf-cr-field { display: flex; flex-direction: column; gap: 6px; }
.uf-cr-input { width: 100%; border-radius: 0; border: 1px solid var(--uf-line-2); background: var(--uf-chrome); color: var(--uf-bone); padding: 9px 12px; font: 400 15px/1.4 var(--uf-body); resize: vertical; }
.uf-cr-input::placeholder { color: var(--uf-faint); }
.uf-cr-input:focus { outline: none; border-color: var(--uf-red); }
.uf-cr-form-actions { display: flex; align-items: center; gap: 22px; }
@media (prefers-reduced-motion: reduce) { .uf-cr-switch-track { transition: none; } }
</style>
