<script setup lang="ts">
/** One recording as a hairline row: map art · agent · title · result · status · actions. */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { matchReportPath } from '../../../lib/match-report'
import type { LibraryRecording } from '../../../lib/footage-library'
import { footageUnavailable } from '../../../lib/footage-library'
import { canOpenTimeline, canWatchRawRecording } from '../../../lib/recording-demo-status'
import { recordingGameTitle, recordingPlayerImage, recordingPlayerLabel } from '../../../lib/recording-display'
import { recordingNeedsAttention } from '../../../lib/recording-library'
import { recordingStatusBadge } from '../../../lib/recording-status'
import UfIcon from '../UfIcon.vue'
import UfDialog from '../UfDialog.vue'
import UfButton from '../UfButton.vue'
import { deadlockRecordingHero, loadDeadlockHeroesOnce } from '../../../lib/deadlock-hero-names'
import { deadlockReviewState } from './deadlock-review-row'
import { gameLogo } from './game-logo'
import { matchRowSummary, storageLine } from './match-row'
import { formatMatchDate, matchMapArt, matchMapLabel } from './match-meta'
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
const openLabel = computed(() => unavailable.value || (props.rec.cloudOnly || props.rec.analysisId != null || canOpenTimeline(props.rec) ? 'Review' : 'Watch'))
const status = computed(() => recordingStatusBadge(props.rec).label)
const storage = computed(() => storageLine(status.value, !!props.rec.hasLocalFile, !!(props.rec.archiveId || props.rec.cloudUploaded)))
/** One status line ("Analysed · Cloud") so every row has the same height and baseline. */
const statusText = computed(() => unavailable.value || [status.value, storage.value].filter(Boolean).join(' · '))
const ufScore = computed(() => matchScore(props.analysis))
/** CS2: ADR / KAST from the demo on hover (the column only fits K/D/A). */
const rowStatsTitle = computed(() => (props.analysis ? cs2StatItems(props.analysis).map(i => `${i.value} ${i.label}`).join(' · ') : ''))
const mapLabel = computed(() => matchMapLabel(props.rec.game, props.rec.map))
const mapArt = computed(() => matchMapArt(props.rec.game, props.rec.map))
const dateText = computed(() => formatMatchDate(props.playedAt || props.rec.recordedAt))
/** "Wingman · 2v2" / "Premier · Ranked": fun modes are kept out of Progress, so the row says which is which. */
const modeText = computed(() => modeQueueLabel(props.rec.game, props.rec.gameMode || props.analysis?.game_mode))
const resultColor = computed(() => summary.value.result === 'win' ? 'var(--uf-win)' : summary.value.result === 'loss' ? 'var(--uf-loss)' : 'var(--uf-bone)')
const logo = computed(() => gameLogo(props.rec.game))
const isDeadlock = computed(() => props.rec.game === 'deadlock')
const playerLabel = computed(() => isDeadlock.value ? deadlockRecordingHero(props.rec.agent) : recordingPlayerLabel(props.rec))
onMounted(() => { if (isDeadlock.value) void loadDeadlockHeroesOnce() })

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
  <div class="uf-row" :class="{ 'is-selected': selected, 'is-selecting': selecting }"
    @click="selecting && !rec.cloudOnly ? emit('toggle') : undefined"
    @mouseenter="canOpen && emit('prefetch')" @focusin="canOpen && emit('prefetch')">
    <span v-if="selecting" class="uf-check" :class="{ 'is-on': selected }" aria-hidden="true">
      <UfIcon v-if="selected" name="check" :size="12" />
    </span>
    <div class="uf-thumb">
      <img v-if="mapArt" :src="mapArt" :alt="mapLabel">
    </div>
    <img v-if="logo" :src="logo" :alt="recordingGameTitle(rec)" class="uf-logo">
    <span v-else class="uf-logo" />
    <div class="uf-who">
      <img v-if="recordingPlayerImage(rec)" :src="recordingPlayerImage(rec)" :alt="playerLabel" class="uf-agent">
      <div class="uf-who-text">
        <span class="uf-t3 uf-trunc">{{ mapLabel || recordingGameTitle(rec) }}</span>
        <span class="uf-t4 uf-trunc">{{ [playerLabel, dateText, modeText].filter(Boolean).join(' · ') }}<span v-if="isAlt" class="uf-alt" title="Played on an alt account: coached, not counted for your focus"> · ALT</span></span>
      </div>
    </div>
    <div class="uf-result">
      <span v-if="summary.score" class="uf-d4 uf-num" :style="{ color: resultColor }">{{ summary.score }}</span>
      <span v-else-if="summary.result" class="uf-d4" :style="{ color: resultColor }">{{ summary.result === 'win' ? 'WIN' : 'LOSS' }}</span>
      <span v-if="summary.kda" class="uf-t4 uf-num" :title="rowStatsTitle || undefined">{{ summary.kda }} K/D/A</span>
      <span v-else-if="!summary.score && !summary.result && analysis !== undefined" class="uf-t4" style="color: var(--uf-faint)">{{ rec.analysisId == null ? 'Not analysed' : 'No scoreboard' }}</span>
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
    </div>
    <div v-if="!selecting" class="uf-actions" @click.stop>
      <button v-if="!rec.cloudOnly && recordingNeedsAttention(rec)" type="button" class="uf-link" :disabled="busy" @click="emit('continue')">Continue →</button>
      <button v-if="review === 'available'" type="button" class="uf-link" :disabled="busy" @click="confirmOpen = true">Review replay</button>
      <span v-else-if="review === 'in_progress'" class="uf-t4">Replay review in progress</span>
      <button v-if="rec.analysisId != null && canWatchRawRecording(rec)" type="button" class="uf-link" @click="emit('watch')">Watch</button>
      <button v-if="reportPath" type="button" class="uf-link" title="Free data report for this match" @click.stop="openReport">Report</button>
      <button type="button" class="uf-btn-secondary uf-open" :disabled="!canOpen || busy" @click="emit('open')">
        <UfIcon :name="openLabel === 'Watch' ? 'play' : 'map'" :size="15" />{{ openLabel }}
      </button>
      <button v-if="!rec.cloudOnly" type="button" class="uf-del" title="Delete recording" aria-label="Delete recording" :disabled="busy" @click="emit('delete')">
        <UfIcon name="close" :size="15" />
      </button>
      <span v-else class="uf-del-slot" aria-hidden="true" />
    </div>
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
/* Fixed columns (shared with the skeleton in MatchesV3) so results, scores, status and Review line up on every row. */
.uf-row { display: grid; grid-template-columns: 18px 120px 22px minmax(160px, 1fr) 104px 72px 160px; gap: 18px; align-items: center; padding: 10px 0; border-top: 1px solid var(--uf-line); }
.uf-row:not(.is-selecting) { grid-template-columns: 120px 22px minmax(160px, 1fr) 104px 72px 160px 260px; }
/* Narrow windows (the list container sets container-type): same columns, tighter. */
@container uf-matches (max-width: 1040px) {
  .uf-row { grid-template-columns: 18px 88px 20px minmax(120px, 1fr) 92px 56px 120px; gap: 14px; }
  .uf-row:not(.is-selecting) { grid-template-columns: 88px 20px minmax(120px, 1fr) 92px 56px 120px 214px; }
  .uf-thumb { width: 88px; height: 48px; }
}
.uf-row.is-selecting { cursor: pointer; }
.uf-row.is-selected { background: rgba(255, 70, 85, 0.06); }
.uf-check { width: 18px; height: 18px; border: 1px solid var(--uf-line-2); display: flex; align-items: center; justify-content: center; }
.uf-check.is-on { background: var(--uf-red); border-color: var(--uf-red); color: #fff; }
.uf-thumb { width: 100%; height: 62px; background: var(--uf-raised); overflow: hidden; }
.uf-thumb img { width: 100%; height: 100%; object-fit: cover; filter: saturate(0.7); }
.uf-logo { width: 22px; height: 16px; object-fit: contain; }
.uf-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.uf-agent { width: 36px; height: 36px; object-fit: cover; background: var(--uf-raised); flex: none; }
.uf-who-text, .uf-status, .uf-result, .uf-score { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.uf-num { font-variant-numeric: tabular-nums; }
.uf-trunc { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px 14px; min-width: 0; }
.uf-del-slot { width: 36px; height: 36px; flex: none; }
.uf-open { height: 36px; }
.uf-open:disabled { opacity: 0.4; cursor: not-allowed; }
.uf-del { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: none; border: 1px solid var(--uf-line); color: var(--uf-faint); cursor: pointer; }
.uf-del:hover { color: var(--uf-loss); border-color: var(--uf-loss); }
</style>
