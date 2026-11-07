<script setup lang="ts">
/** One recording as a hairline row: map art · agent · title · result · status · actions. */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { matchReportPath } from '../../../lib/match-report'
import type { LibraryRecording } from '../../../lib/footage-library'
import { footageUnavailable } from '../../../lib/footage-library'
import { canOpenTimeline, canWatchRawRecording } from '../../../lib/recording-demo-status'
import { recordingGameTitle, recordingPlayerLabel } from '../../../lib/recording-display'
import { recordingNeedsAttention } from '../../../lib/recording-library'
import { recordingStatusBadge } from '../../../lib/recording-status'
import UfIcon from '../UfIcon.vue'
import UfDialog from '../UfDialog.vue'
import UfButton from '../UfButton.vue'
import { deadlockRecordingHero, loadDeadlockHeroesOnce } from '../../../lib/deadlock-hero-names'
import { deadlockReviewState } from './deadlock-review-row'
import { gameLogo } from './game-logo'
import { matchRowSummary, rowCloudAction, rowOpenAction, storageLine } from './match-row'
import { useReadyAnalyses } from '../../../composables/useReadyAnalyses'
import { parseRetention, retentionLine } from '../../../lib/cloud-retention'
import { useCloudRetention } from '../../../composables/useCloudRetention'
import { formatMatchDate, matchMapLabel, matchRowArt } from './match-meta'
import { matchScore, scoreToneColor } from '../../../lib/upforge-score'
import { cs2StatItems } from '../../../lib/cs2-analyses'
import { modeQueueLabel } from '../../../lib/game-queue'
import type { AnalysisItem } from '../../../env.d.ts'

/**
 * `playedAt` = the match date (earliest known timestamp); falls back to when it was recorded.
 * `analysis`: the joined server analysis; `undefined` while it is still loading (row shows no "No scoreboard" yet).
 */
const props = defineProps<{ rec: LibraryRecording; busy: boolean; selecting: boolean; selected: boolean; hint: string | null; analysis?: AnalysisItem | null; playedAt?: number }>()
const router = useRouter()
/** Free data report for this match (Valorant, League, Deadlock by match id; CS2 by recording). */
const reportPath = computed(() => matchReportPath(props.rec.game, (props.rec as { matchId?: string | null }).matchId, props.rec.id))
function openReport(): void { if (reportPath.value) router.push(reportPath.value).catch(() => {}) }
const emit = defineEmits<{ open: []; watch: []; continue: []; delete: []; toggle: []; prefetch: [] }>()

// Cloud-only rows carry their own score from the cloud inventory (API round 7).
const summary = computed(() => matchRowSummary(props.rec, props.analysis ?? (props.rec as { cloudFile?: { analysis?: Parameters<typeof matchRowSummary>[1] } }).cloudFile?.analysis ?? null))
const isAlt = computed(() => (props.rec as { riotAccountRole?: string | null }).riotAccountRole === 'alt')
const unavailable = computed(() => footageUnavailable(props.rec))
const canOpen = computed(() => !unavailable.value && (canWatchRawRecording(props.rec) || props.rec.analysisId != null))
const openAction = computed(() => rowOpenAction(props.rec, { unavailable: !!unavailable.value, timeline: canOpenTimeline(props.rec) }))
const openLabel = computed(() => unavailable.value || openAction.value.label)
// Coaching finished but not opened yet: the same list that drives the Matches badge.
const { items: readyItems } = useReadyAnalyses()
const isNew = computed(() => props.rec.analysisId != null && readyItems.value.some(r => r.analysisId === props.rec.analysisId))
const status = computed(() => recordingStatusBadge(props.rec).label)
const storage = computed(() => storageLine(status.value, !!props.rec.hasLocalFile, !!(props.rec.archiveId || props.rec.cloudUploaded)))
/** One status line ("Analysed · Cloud") so every row has the same height and baseline. */
const statusText = computed(() => unavailable.value || [status.value, storage.value].filter(Boolean).join(' · '))
const ufScore = computed(() => matchScore(props.analysis))
/** CS2: ADR / KAST from the demo on hover (the column only fits K/D/A). */
const rowStatsTitle = computed(() => (props.analysis ? cs2StatItems(props.analysis).map(i => `${i.value} ${i.label}`).join(' · ') : ''))
const mapLabel = computed(() => matchMapLabel(props.rec.game, props.rec.map))
// Web companion band: the map (or champion) fills the row, the agent stands in it, washed in the result colour.
const art = computed(() => matchRowArt(props.rec))
const tone = computed(() => summary.value.result ?? 'none')
const resultWordText = computed(() => summary.value.result === 'win' ? 'Victory' : summary.value.result === 'loss' ? 'Defeat' : summary.value.score ? 'Draw' : '')
const dateText = computed(() => formatMatchDate(props.playedAt || props.rec.recordedAt))
/** "Wingman · 2v2" / "Premier · Ranked": fun modes are kept out of Progress, so the row says which is which. */
const modeText = computed(() => modeQueueLabel(props.rec.game, props.rec.gameMode || props.analysis?.game_mode))
const resultColor = computed(() => summary.value.result === 'win' ? 'var(--uf-win)' : summary.value.result === 'loss' ? 'var(--uf-loss)' : 'var(--uf-bone)')
const logo = computed(() => gameLogo(props.rec.game))
const isDeadlock = computed(() => props.rec.game === 'deadlock')
const playerLabel = computed(() => isDeadlock.value ? deadlockRecordingHero(props.rec.agent) : recordingPlayerLabel(props.rec))
onMounted(() => { if (isDeadlock.value) void loadDeadlockHeroesOnce() })

// Cloud retention: countdown → keep options; only on this PC → Save to cloud (respects a full quota).
const cloudAction = computed(() => props.selecting ? null : rowCloudAction(props.rec, retentionLine(parseRetention(props.rec.cloudFile?.retention))))
const { savesPausedMessage, refresh: refreshRetention } = useCloudRetention()
const saveOpen = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)
function keepInCloud() { router.push({ path: '/cloud-storage', query: { keep: '1' } }).catch(() => {}) }
async function saveToCloud() {
  saveError.value = null
  // Full quota: say why first (analysis still works), never start an upload the API will refuse.
  if (savesPausedMessage.value) { saveOpen.value = true; return }
  saving.value = true
  try {
    const res = await window.api.recordings.saveToCloud(props.rec.id)
    if (!res.ok) { saveError.value = res.error; saveOpen.value = true }
    void refreshRetention(true)
  } catch {
    saveError.value = 'Could not save to cloud. Check your connection and try again.'
    saveOpen.value = true
  } finally {
    saving.value = false
  }
}

// Deadlock "Review replay": a deliberate, confirmed action (it uses 1 analysis).
const review = computed(() => deadlockReviewState(props.rec))
const confirmOpen = ref(false)
const reviewBusy = ref(false)
const reviewError = ref<string | null>(null)
async function startReview() {
  reviewBusy.value = true
  reviewError.value = null
  try {
    const res = await window.api.deadlock.reviewReplay(props.rec.id)
    if (res.ok) confirmOpen.value = false
    else reviewError.value = res.error
  } catch {
    reviewError.value = 'The review could not start. Try again in a moment.'
  } finally {
    reviewBusy.value = false
  }
}
</script>

<template>
  <div class="uf-row uf-band" :class="[{ 'is-selected': selected, 'is-selecting': selecting }, `is-${tone}`]"
    @click="selecting && !rec.cloudOnly ? emit('toggle') : undefined"
    @mouseenter="canOpen && emit('prefetch')" @focusin="canOpen && emit('prefetch')">
    <img v-if="art.backdrop" :src="art.backdrop" alt="" aria-hidden="true" class="uf-band-bg" loading="lazy">
    <span v-if="selecting" class="uf-check" :class="{ 'is-on': selected }" aria-hidden="true">
      <UfIcon v-if="selected" name="check" :size="12" />
    </span>
    <div class="uf-art" aria-hidden="true">
      <img v-if="art.figure" :src="art.figure" alt="" class="uf-figure" loading="lazy">
      <img v-else-if="art.icon" :src="art.icon" alt="" class="uf-figure-icon" loading="lazy">
    </div>
    <div class="uf-result">
      <span v-if="resultWordText" class="uf-label uf-res-word">{{ resultWordText }}</span>
      <span v-if="summary.score" class="uf-d3 uf-num uf-res-score">{{ summary.score }}</span>
      <span v-else-if="!summary.result && analysis !== undefined" class="uf-t4" style="color: var(--uf-faint)">{{ rec.analysisId == null ? 'Not analysed' : 'No scoreboard' }}</span>
    </div>
    <div class="uf-who-text">
      <span class="uf-t3 uf-trunc uf-map"><img v-if="logo" :src="logo" :alt="recordingGameTitle(rec)" class="uf-logo">{{ mapLabel || recordingGameTitle(rec) }}</span>
      <span class="uf-t4 uf-trunc">{{ [playerLabel, dateText, modeText].filter(Boolean).join(' · ') }}<span v-if="isAlt" class="uf-alt" title="Played on an alt account: coached, not counted for your focus"> · ALT</span></span>
    </div>
    <div class="uf-kda" :title="rowStatsTitle || undefined">
      <template v-if="summary.kda">
        <span class="uf-t1 uf-num">{{ summary.kda }}</span>
        <span class="uf-t4">K / D / A</span>
      </template>
    </div>
    <div class="uf-score" :title="ufScore ? (ufScore.kind === 'stats' ? `UpForge score ${ufScore.text} of 1000 · ${ufScore.label}` : `Coach rating ${ufScore.text}`) : undefined">
      <template v-if="ufScore">
        <span class="uf-t3 uf-num" :style="{ color: ufScore.tone ? scoreToneColor(ufScore.tone) : 'var(--uf-bone)' }">{{ ufScore.text }}</span>
        <span class="uf-t4">{{ ufScore.kind === 'stats' ? 'UpForge' : 'Coach rating' }}</span>
      </template>
    </div>
    <div class="uf-status">
      <span class="uf-t4 uf-trunc" :style="{ color: unavailable ? 'var(--uf-loss)' : 'var(--uf-muted)' }" :title="statusText">{{ statusText }}</span>
      <span v-if="hint" class="uf-t4 uf-trunc" style="color: var(--uf-gold)" :title="hint">{{ hint }}</span>
      <button v-else-if="cloudAction?.kind === 'keep'" type="button" class="uf-link uf-t4 uf-trunc uf-cloud" :class="{ 'is-warn': cloudAction.warn }" :title="cloudAction.detail ?? 'Keep it in the cloud or download a copy'" @click.stop="keepInCloud">{{ cloudAction.text }}</button>
      <button v-else-if="cloudAction?.kind === 'save'" type="button" class="uf-link uf-t4 uf-trunc uf-cloud" :disabled="saving || busy" @click.stop="saveToCloud">{{ saving ? 'Saving to cloud…' : cloudAction.text }}</button>
      <span v-else-if="cloudAction?.kind === 'removed'" class="uf-t4 uf-trunc" style="color: var(--uf-faint)">{{ cloudAction.text }}</span>
    </div>
    <div v-if="!selecting" class="uf-actions" @click.stop>
      <button v-if="!rec.cloudOnly && recordingNeedsAttention(rec)" type="button" class="uf-link" :disabled="busy" @click="emit('continue')">Continue →</button>
      <button v-if="review === 'available'" type="button" class="uf-link" :disabled="busy" @click="confirmOpen = true">Review replay</button>
      <span v-else-if="review === 'in_progress'" class="uf-t4">Replay review in progress</span>
      <button v-if="rec.analysisId != null && canWatchRawRecording(rec)" type="button" class="uf-link" @click="emit('watch')">Watch</button>
      <button v-if="reportPath" type="button" class="uf-link" title="Free stats report for this match (no AI)" @click.stop="openReport">Stats report</button>
      <button type="button" class="uf-btn-secondary uf-open" :class="{ 'uf-open--ai': openAction.ai }" :title="openAction.title" :disabled="!canOpen || busy" @click="emit('open')">
        <UfIcon :name="openAction.icon" :size="15" /><span v-if="isNew" class="uf-open-new" title="Not opened yet"><span class="uf-sr">New: </span></span>{{ openLabel }}
      </button>
      <button v-if="!rec.cloudOnly" type="button" class="uf-del" title="Delete recording" aria-label="Delete recording" :disabled="busy" @click="emit('delete')">
        <UfIcon name="close" :size="15" />
      </button>
      <span v-else class="uf-del-slot" aria-hidden="true" />
    </div>
    <UfDialog :open="saveOpen" :title="savesPausedMessage && !saveError ? 'Your cloud space is full' : 'Could not save to cloud'" kicker="Cloud storage" :width="440" @close="saveOpen = false">
      <p class="uf-t2" style="margin: 0">{{ saveError || savesPausedMessage }}</p>
      <p class="uf-t4" style="margin: 0">This match stays on this PC and keeps working for review.</p>
      <template #actions>
        <UfButton variant="secondary" @click="saveOpen = false">Close</UfButton>
        <UfButton variant="primary" @click="saveOpen = false; keepInCloud()">Add space</UfButton>
      </template>
    </UfDialog>
    <UfDialog :open="confirmOpen" title="Review this replay?" kicker="Deadlock" :width="440" @close="confirmOpen = false">
      <p class="uf-t2" style="margin: 0">UpForge reads this match's replay and adds your kills and deaths to the recording, with coaching on your souls, items and fights.</p>
      <p class="uf-t4" style="margin: 0">This uses 1 analysis from your plan.</p>
      <p v-if="reviewError" class="uf-t4" style="margin: 0; color: var(--uf-loss)">{{ reviewError }}</p>
      <template #actions>
        <UfButton variant="secondary" :disabled="reviewBusy" @click="confirmOpen = false">Cancel</UfButton>
        <UfButton variant="primary" :disabled="reviewBusy" @click="startReview">{{ reviewBusy ? 'Starting…' : 'Review replay' }}</UfButton>
      </template>
    </UfDialog>
  </div>
</template>

<style scoped>
.uf-alt { font-weight: 600; letter-spacing: 0.08em; color: var(--uf-muted); }
/* Fixed columns (shared with the skeleton in MatchesV3) so results, scores, status and actions line up on every row. */
.uf-row { display: grid; grid-template-columns: 18px 150px 104px minmax(150px, 1fr) 104px 96px 140px; gap: 18px; align-items: center; padding: 0 16px 0 0; min-height: 88px; border-top: 1px solid var(--uf-line); }
.uf-row:not(.is-selecting) { grid-template-columns: 150px 104px minmax(150px, 1fr) 104px 96px 140px 320px; }
/* Narrow windows (the list container sets container-type): same columns, tighter. */
@container uf-matches (max-width: 1040px) {
  .uf-row { grid-template-columns: 18px 110px 92px minmax(120px, 1fr) 88px 84px 112px; gap: 14px; min-height: 80px; }
  .uf-row:not(.is-selecting) { grid-template-columns: 110px 92px minmax(120px, 1fr) 88px 84px 112px 270px; }
}
/* Band (web companion Matches): backdrop art fills the row, a dark fade keeps text readable,
   the result colour washes in from the left. */
.uf-band { --tone: 122, 130, 142; position: relative; overflow: hidden; isolation: isolate; box-shadow: inset 3px 0 0 rgb(var(--tone)); }
.uf-band.is-win { --tone: 34, 169, 155; }
.uf-band.is-loss { --tone: 232, 80, 91; }
.uf-band::before { content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background:
    linear-gradient(90deg, rgba(var(--tone), 0.42) 0%, rgba(var(--tone), 0.12) 26%, rgba(var(--tone), 0) 55%),
    linear-gradient(90deg, rgba(14, 17, 22, 0.2) 0%, rgba(14, 17, 22, 0.8) 26%, rgba(14, 17, 22, 0.95) 58%);
  transition: opacity 0.15s ease; }
.uf-band:hover::before { opacity: 0.88; }
.uf-band-bg { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; object-position: center 40%; filter: saturate(0.85); }
.uf-art { position: relative; align-self: stretch; overflow: hidden; }
.uf-figure { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); height: 250%; width: auto; max-width: none; filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55)); transition: transform 0.2s ease; }
.uf-band:hover .uf-figure { transform: translate(-50%, -3px); }
.uf-figure-icon { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 52px; height: 52px; object-fit: cover; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5); }
.uf-res-word { color: rgb(var(--tone)); font-weight: 700; filter: brightness(1.15); }
.uf-res-score { color: var(--uf-bone); white-space: nowrap; }
.uf-map { display: inline-flex; align-items: center; gap: 8px; }
.uf-kda { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.uf-kda .uf-t1 { font-size: 22px; line-height: 1.1; white-space: nowrap; }
/* Text over the art: one step brighter than page greys, with a soft shadow. */
.uf-band .uf-t4 { color: #c9c5be; }
.uf-band .uf-result, .uf-band .uf-who-text, .uf-band .uf-kda, .uf-band .uf-score, .uf-band .uf-status { text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); }
@media (prefers-reduced-motion: reduce) { .uf-band::before, .uf-figure { transition: none; } .uf-band:hover .uf-figure { transform: translateX(-50%); } }
.uf-row.is-selecting { cursor: pointer; }
.uf-row.is-selected { background: rgba(255, 70, 85, 0.06); }
.uf-row.is-selecting .uf-check { margin-left: 12px; }
.uf-check { width: 18px; height: 18px; border: 1px solid var(--uf-line-2); display: flex; align-items: center; justify-content: center; background: rgba(14, 17, 22, 0.6); }
.uf-check.is-on { background: var(--uf-red); border-color: var(--uf-red); color: #fff; }
.uf-logo { width: 18px; height: 14px; object-fit: contain; flex: none; }
.uf-who-text, .uf-status, .uf-result, .uf-score { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.uf-num { font-variant-numeric: tabular-nums; }
.uf-trunc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px 14px; min-width: 0; }
.uf-cloud { align-self: flex-start; max-width: 100%; text-align: left; color: var(--uf-muted); }
.uf-cloud.is-warn { color: var(--uf-gold); }
.uf-del-slot { width: 36px; height: 36px; flex: none; }
.uf-open { height: 36px; }
/* AI-coached matches: the coaching is the thing to open, so the button says so and stands out. */
.uf-open--ai { border-color: var(--uf-red); color: var(--uf-bone); }
.uf-open--ai :deep(svg) { color: var(--uf-red); }
.uf-open { position: relative; }
/* Not opened yet: a small red corner marker (no pill). */
.uf-open-new { position: absolute; top: -4px; right: -4px; width: 8px; height: 8px; background: var(--uf-red); }
.uf-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.uf-score .uf-t4 { white-space: nowrap; }
.uf-open:disabled { opacity: 0.4; cursor: not-allowed; }
.uf-del { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--uf-line); color: var(--uf-faint); cursor: pointer; }
.uf-del:hover { color: var(--uf-loss); border-color: var(--uf-loss); }
</style>
