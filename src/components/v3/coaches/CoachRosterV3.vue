<script setup lang="ts">
/**
 * Students (UI v3): coaching others. Pure view over the `useCoachRoster` instance a parent provides
 * (StudentsV3, or RostersCoachPanel) — same load, IPC calls, toasts and routes as the old panel.
 * Order: H1 = the real state · Needs your notes (queue first) · Your students · invite, Taking new
 * students, Plan and price. A coach profile with no live plan and no students gets the one-screen
 * setup instead (coaches-flow-proposal.md screen d). Human coaching words only — no "roster".
 */
import { computed, inject } from 'vue'
import UfButton from '../UfButton.vue'
import UfSkeleton from '../UfSkeleton.vue'
import UfTabs from '../UfTabs.vue'
import RosterMatchRowV3 from './RosterMatchRowV3.vue'
import { draftLine, rosterMemberLine, settingsSummaryText, studentsHeadline, studentsSummary } from './coach-format'
import { playerIdentity } from '../../../lib/player-identity'
import PlayerAvatar from '../identity/PlayerAvatar.vue'
import RankIcon from '../identity/RankIcon.vue'
import { coachRosterKey } from '../../rosters/useCoachRoster'
import { openQueueCount, riotId, type CoachReview, type MembershipMode } from '../../rosters/coach-roster'
import { plural } from '../../../lib/plural'

const injected = inject(coachRosterKey)
if (!injected) throw new Error('CoachRosterV3 needs a useCoachRoster instance (StudentsV3 or RostersCoachPanel)')
const r = injected

const {
  loading, error, saving, settings, students, reviews,
  welcome, membershipMode, priceDollars, includedReviews, settingsOpen,
  draftReason, draftFix, needsSetup,
  load, toggleEnabled, savePricing, copyInvite, openPayouts, openPro, openAnalysis,
} = r

const queueCount = computed(() => openQueueCount(reviews.value))
/** Screen (d): coach profile, plan not live and nobody joined yet. */
const setup = computed(() => !!settings.value && !settings.value.roster_is_live && students.value.length === 0)
const title = computed(() => (setup.value ? 'Coach players between sessions' : studentsHeadline(queueCount.value)))
const summary = computed(() => (setup.value
  ? 'Players join you, send their matches, and you write notes on their timeline. Free or paid plan, your price.'
  : studentsSummary(students.value.length, membershipMode.value, priceDollars.value, settings.value)))
const settingsSummary = computed(() => settingsSummaryText(membershipMode.value, priceDollars.value, includedReviews.value, needsSetup.value))
const draftText = computed(() => (draftReason.value ? draftLine(draftFix.value) : null))

/** Player card → main agent → letter, plus rank (rank/agent only when the student shares their skill profile — API side). */
const studentIdentities = computed(() => new Map(students.value.map(entry => [entry.student.id, playerIdentity({
  name: entry.student.name, playerCardId: entry.player_card_id, agent: entry.most_played_agent, rank: entry.current_rank,
})])))
function studentIdentity(entry: (typeof students.value)[number]) {
  return studentIdentities.value.get(entry.student.id) ?? playerIdentity({ name: entry.student.name })
}
function studentRank(entry: (typeof students.value)[number]): { text: string; icon: string | null } | null {
  const id = studentIdentity(entry)
  const parts = [id.rankLabel, entry.most_played_agent?.trim()].filter((x): x is string => !!x)
  return parts.length ? { text: parts.join(' · '), icon: id.rankIcon } : null
}
/** Queue row: "Alfie · in progress · asked a question". */
function queueLine(review: CoachReview): string {
  const parts = [review.user?.name || 'Student', review.status === 'in_progress' ? 'you started notes' : 'waiting']
  if (review.student_question?.trim()) parts.push('has a question')
  return parts.join(' · ')
}

const modeItems = [{ key: 'free', label: 'Free' }, { key: 'paid', label: 'Paid' }] as const
function setMode(key: string) { membershipMode.value = key as MembershipMode }
function fixDraft() { if (draftFix.value === 'pro') void openPro(); else void openPayouts() }
</script>

<template>
  <div class="uf-cr">
    <!-- First-ever load: placeholders in the shape of the header, queue rows and student rows. -->
    <div v-if="loading" aria-busy="true" aria-label="Loading your students" class="uf-cr-skel">
      <UfSkeleton :w="90" :h="12" />
      <UfSkeleton w="38%" :h="40" />
      <UfSkeleton w="46%" :h="15" />
      <UfSkeleton :w="110" :h="12" style="margin-top: 18px" />
      <div v-for="i in 2" :key="'q' + i" class="uf-cr-skel-row"><UfSkeleton :w="64" :h="36" /><span class="uf-cr-skel-lines"><UfSkeleton w="32%" :h="15" /><UfSkeleton w="22%" :h="13" /></span></div>
      <UfSkeleton :w="110" :h="12" style="margin-top: 18px" />
      <div v-for="i in 2" :key="'m' + i" class="uf-cr-skel-row"><UfSkeleton :w="40" :h="40" /><span class="uf-cr-skel-lines"><UfSkeleton w="26%" :h="15" /><UfSkeleton w="40%" :h="13" /></span></div>
    </div>

    <div v-else-if="error" class="uf-cr-state">
      <span class="uf-label">Students</span>
      <p class="uf-t1">Couldn’t load your students.</p>
      <p class="uf-t2">{{ error }}</p>
      <div><UfButton variant="primary" @click="load">Try again</UfButton></div>
    </div>

    <template v-else-if="settings">
      <header class="uf-cr-head uf-rise">
        <span class="uf-label">Students</span>
        <h1 class="uf-d2">{{ title }}</h1>
        <p class="uf-t2">{{ summary }}</p>
      </header>

      <!-- (d) One-screen setup: pick a plan, turn it on, share the link. -->
      <ol v-if="setup" class="uf-cr-steps uf-rise uf-d1s">
        <li class="uf-cr-step">
          <span class="uf-cr-step-n">1</span>
          <div class="uf-cr-step-body">
            <span class="uf-t3">Pick a plan</span>
            <UfTabs size="filter" label="Student plan" :items="modeItems" :model-value="membershipMode" @update:model-value="setMode" />
            <div class="uf-cr-grid">
              <label v-if="membershipMode === 'paid'" class="uf-cr-field">
                <span class="uf-t4">Price a month (USD)</span>
                <input v-model.number="priceDollars" type="number" min="5" step="0.01" class="uf-input">
              </label>
              <label class="uf-cr-field">
                <span class="uf-t4">Reviews per student a month</span>
                <input v-model.number="includedReviews" type="number" min="1" max="20" class="uf-input">
              </label>
            </div>
            <div><UfButton variant="secondary" :disabled="saving" @click="savePricing">{{ saving ? 'Saving…' : 'Save plan' }}</UfButton></div>
          </div>
        </li>
        <li class="uf-cr-step">
          <span class="uf-cr-step-n">2</span>
          <div class="uf-cr-step-body">
            <span class="uf-cr-switch">
              <button type="button" role="switch" class="uf-switch" :aria-checked="!!settings.roster_enabled" aria-labelledby="uf-cr-setup-open"
                :disabled="saving" @click="toggleEnabled" />
              <span id="uf-cr-setup-open" class="uf-t3">Taking new students</span>
            </span>
            <p v-if="draftText" class="uf-cr-draft">{{ draftText }} <UfButton v-if="draftFix" variant="link" @click="fixDraft">{{ draftFix === 'pro' ? 'Coach Pro on upforge.gg' : 'Set up payouts on upforge.gg' }}</UfButton></p>
          </div>
        </li>
        <li class="uf-cr-step">
          <span class="uf-cr-step-n">3</span>
          <div class="uf-cr-step-body">
            <span class="uf-t3">Share your link</span>
            <div><UfButton variant="secondary" icon="share" @click="copyInvite">Copy invite link</UfButton></div>
          </div>
        </li>
        <li class="uf-cr-foot">
          <UfButton variant="link" @click="openPayouts">Paid plans need payouts set up on upforge.gg</UfButton>
        </li>
      </ol>

      <template v-else>
        <!-- Queue first: the daily job -->
        <section>
          <div class="uf-cr-sec-head">
            <span class="uf-label">Needs your notes<span v-if="queueCount" class="uf-cr-count">{{ queueCount }}</span></span>
          </div>
          <p v-if="!reviews.length" class="uf-t4 uf-cr-empty">Nothing waiting. Students send matches from the app after a game.</p>
          <RosterMatchRowV3 v-for="review in reviews" :key="review.id" :match="review.analysis ?? {}"
            :subtitle="queueLine(review)" @open="openAnalysis(review)">
            <template #action>
              <UfButton variant="secondary" icon="chat" title="Open the match and write notes at the video time" @click="openAnalysis(review)">Write notes</UfButton>
            </template>
          </RosterMatchRowV3>
        </section>

        <section>
          <div class="uf-cr-sec-head">
            <span class="uf-label">Your students<span class="uf-cr-count">{{ students.length }}</span></span>
          </div>
          <p v-if="!students.length" class="uf-t4 uf-cr-empty">No students yet. Copy your invite link and send it to the players you coach.</p>
          <div v-for="entry in students" :key="entry.student.id" class="uf-cr-member">
            <PlayerAvatar :identity="studentIdentity(entry)" :size="48" />
            <span class="uf-cr-member-main">
              <span class="uf-cr-member-name">
                <span class="uf-t3">{{ entry.student.name }}</span>
                <span v-if="studentRank(entry)" class="uf-t4 uf-cr-rank">
                  <RankIcon :src="studentRank(entry)!.icon" :size="16" />{{ studentRank(entry)!.text }}
                </span>
              </span>
              <span class="uf-t4"><span v-if="riotId(entry)" class="uf-cr-mono">{{ riotId(entry) }}</span><span v-else>Riot ID not linked</span> · {{ rosterMemberLine(entry) }}</span>
            </span>
            <span v-if="entry.open_review_count > 0" class="uf-t4 uf-cr-open">{{ plural(entry.open_review_count, 'match', 'matches') }} waiting</span>
          </div>
        </section>

        <!-- Invite · Taking new students · Plan and price -->
        <section class="uf-cr-controls">
          <div class="uf-cr-controls-row">
            <UfButton variant="secondary" icon="share" @click="copyInvite">Copy invite link</UfButton>
            <span class="uf-cr-switch">
              <button type="button" role="switch" class="uf-switch" :aria-checked="!!settings.roster_enabled" aria-labelledby="uf-cr-open-label"
                :disabled="saving" @click="toggleEnabled" />
              <span id="uf-cr-open-label" class="uf-t3">Taking new students</span>
            </span>
          </div>
          <p v-if="draftText" class="uf-cr-draft">{{ draftText }} <UfButton v-if="draftFix" variant="link" @click="fixDraft">{{ draftFix === 'pro' ? 'Coach Pro on upforge.gg' : 'Set up payouts on upforge.gg' }}</UfButton></p>

          <div class="uf-cr-settings">
            <button type="button" class="uf-cr-settings-head" :aria-expanded="settingsOpen" aria-controls="uf-cr-settings-body" @click="settingsOpen = !settingsOpen">
              <span class="uf-cr-member-main">
                <span class="uf-t3">Plan and price</span>
                <span class="uf-t4">{{ settingsSummary }}</span>
              </span>
              <span class="uf-t4">{{ settingsOpen ? 'Hide' : 'Edit' }}</span>
            </button>

            <div v-if="settingsOpen" id="uf-cr-settings-body" class="uf-cr-form">
              <UfTabs size="filter" label="Student plan" :items="modeItems" :model-value="membershipMode" @update:model-value="setMode" />
              <div class="uf-cr-grid">
                <label v-if="membershipMode === 'paid'" class="uf-cr-field">
                  <span class="uf-t4">Price a month (USD)</span>
                  <input v-model.number="priceDollars" type="number" min="5" step="0.01" class="uf-input">
                </label>
                <label class="uf-cr-field">
                  <span class="uf-t4">Reviews per student a month</span>
                  <input v-model.number="includedReviews" type="number" min="1" max="20" class="uf-input">
                </label>
              </div>
              <label class="uf-cr-field">
                <span class="uf-t4">Welcome message</span>
                <textarea v-model="welcome" rows="2" maxlength="500" class="uf-input uf-cr-area" placeholder="What students should expect after joining" />
              </label>
              <div class="uf-cr-form-actions">
                <UfButton variant="primary" :disabled="saving" @click="savePricing">{{ saving ? 'Saving…' : 'Save' }}</UfButton>
                <UfButton variant="link" @click="openPayouts">Payouts and Coach Pro on upforge.gg</UfButton>
              </div>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.uf-cr { display: flex; flex-direction: column; gap: 28px; }
.uf-cr p, .uf-cr h1, .uf-cr ol { margin: 0; }
.uf-cr-skel { display: flex; flex-direction: column; gap: 12px; }
.uf-cr-skel-row { display: flex; align-items: center; gap: 14px; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-cr-skel-lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
.uf-cr-state { display: flex; flex-direction: column; gap: 12px; padding: 30px 0; max-width: 720px; }
.uf-cr-head { display: flex; flex-direction: column; gap: 10px; max-width: 760px; }
.uf-cr-steps { list-style: none; padding: 0; display: flex; flex-direction: column; max-width: 720px; }
.uf-cr-step { display: grid; grid-template-columns: 36px 1fr; gap: 14px; padding: 18px 0; border-top: 1px solid var(--uf-line); }
.uf-cr-step-n { font: 700 22px/1 var(--uf-display); color: var(--uf-muted); font-variant-numeric: tabular-nums; }
.uf-cr-step-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.uf-cr-foot { padding: 14px 0 0 50px; border-top: 1px solid var(--uf-line); }
.uf-cr-switch { display: inline-flex; align-items: center; gap: 10px; color: var(--uf-bone); }
.uf-cr-draft { font: 400 13px/1.5 var(--uf-body); color: var(--uf-gold); padding-left: 12px; border-left: 2px solid var(--uf-gold); }
.uf-cr-sec-head { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 8px; }
.uf-cr-count { margin-left: 10px; color: var(--uf-muted); font-variant-numeric: tabular-nums; }
.uf-cr-empty { padding: 12px 0; border-top: 1px solid var(--uf-line); }
.uf-cr-member { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--uf-line); }
.uf-cr-member-name { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.uf-cr-rank { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.uf-cr-member-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.uf-cr-member-main > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-cr-mono { font-variant-numeric: tabular-nums; color: var(--uf-muted); }
.uf-cr-open { color: var(--uf-muted); font-variant-numeric: tabular-nums; }
.uf-cr-controls { display: flex; flex-direction: column; gap: 14px; }
.uf-cr-controls-row { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
.uf-cr-settings { border-top: 1px solid var(--uf-line); border-bottom: 1px solid var(--uf-line); }
.uf-cr-settings-head { width: 100%; display: flex; align-items: center; gap: 16px; padding: 14px 0; background: none; border: 0; color: inherit; cursor: pointer; text-align: left; }
.uf-cr-settings-head:hover .uf-t4:last-child { color: var(--uf-bone); }
.uf-cr-form { display: flex; flex-direction: column; gap: 18px; padding: 4px 0 20px; max-width: 640px; }
.uf-cr-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; max-width: 520px; }
.uf-cr-field { display: flex; flex-direction: column; gap: 6px; }
.uf-cr-area { resize: vertical; }
.uf-cr-form-actions { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
</style>
