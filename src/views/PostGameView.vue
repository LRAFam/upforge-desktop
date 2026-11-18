<template>
  <div ref="contentRoot" class="h-auto">
    <PostGameV3
      :ready="state === 'ready'"
      :tone="compactTone"
      :eyebrow="compactEyebrow"
      :title="compactTitle"
      :body="compactBody"
      :progress="compactProgress"
      :status="compactStatus"
      :timing="compactTiming"
      :primary-label="state === 'ready' && result?.analysis_id ? 'Review coaching' : state === 'ready' ? 'Open report' : 'Open UpForge'"
      :secondary-label="state === 'ready' && result?.analysis_id && analysisUrl ? 'Open on upforge.gg' : null"
      :show-expectations="['preparing', 'uploading', 'analysing'].includes(state)"
      :score="v3ScoreLine"
      :show-feedback="state === 'ready' && Boolean(result?.analysis_id)"
      :feedback-rating="feedbackRating"
      :feedback-text="feedbackText"
      :feedback-submitting="feedbackSubmitting"
      :feedback-submitted="feedbackSubmitted"
      :feedback-error="feedbackError"
      :summary="result ? {
        result: result.match_result ?? null,
        ally: result.ally_score ?? null,
        enemy: result.enemy_score ?? null,
        kills: result.kills ?? null,
        deaths: result.deaths ?? null,
        assists: result.assists ?? null,
      } : null"
      :match-name="matchHeadline"
      :map-name="gameInfo.game === 'valorant' ? gameInfo.map : null"
      :map-art="mapSplashUrl || null"
      :agent-art="(gameInfo.game === 'valorant' || gameInfo.game === 'lol') && !agentImageBroken ? agentImageUrl || null : null"
      :coach-line="focusHero?.headline ?? null"
      :coach-sub="focusHero?.subline ?? focusHero?.recurrence ?? null"
      :clip-count="sessionClipCount"
      :send-coach-name="sendCoachName"
      :review-round="gameInfo.game === 'valorant' ? reviewRoundShown : null"
      :report-match-id="gameInfo.game === 'valorant' && matchId && matchId !== 'preview-match-id' ? matchId : null"
      :cloud-line="state === 'ready' && result?.analysis_id ? postGameCloud : null"
      :game="gameInfo.game"
      :auto-analyse-offer="state === 'pending' ? autoAnalyseOffer : null"
      @auto-analyse-choice="answerAutoAnalyse"
      @keep-cloud="handoffToMain({ path: '/cloud-storage', query: { keep: '1' } })"
      @primary="handleCompactPrimary"
      @secondary="viewFullAnalysis"
      @send-to-coach="sendToCoach"
      @review-round="openReviewRound"
      @open-report="openMatchReport"
      @close="dismiss"
      @feedback-positive="submitAnalysisFeedback('thumbs_up')"
      @feedback-negative="selectNegativeFeedback"
      @feedback-cancel="cancelNegativeFeedback"
      @feedback-submit="submitAnalysisFeedback('thumbs_down')"
      @update:feedback-text="feedbackText = $event"
    />
  </div>
</template>

<script setup lang="ts">
import { singleFlight } from '../lib/single-flight'
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { getAgentImage, getMapImage } from '../lib/valorant'
import { reviewRoundFor, type ValorantTimelineLike } from '../components/v3/matchpage/valorant/valorant-match-view'
import { roundToQuery } from '../components/v3/matchpage/valorant/round-link'
import { desktopVodResultsUrl, isPrimaryGame, normalizePrimaryGame, recordingGameLabel, type PrimaryGame } from '../lib/games'
import { cs2MapDisplayName, getCs2RadarUrl, isCs2Map } from '../lib/cs2-maps'
import { championIconUrl } from '../lib/lol'
import { coachingSkipMessage } from '../lib/coaching-preferences'
import { type DuelMoment, type DuelMomentManifest } from '../lib/duel-moments'
import { buildFocusHeroCopy } from '../lib/skill-profile'
import type { MatchSpatialSummary } from '../lib/spatial-types'
import type { SkillProfileSnapshot } from '../lib/skill-profile'
import type { MatchHighlight } from '../lib/match-highlights'
import { filterSessionClips } from '../lib/session-clips'
import type { ClipRecord } from '../env.d.ts'
import type { CategoryPercentileEntry } from '../components/CategoryPercentilesStrip.vue'
import { buildAnalysisErrorPayload, type AnalysisErrorPayload } from '../lib/analysis-failure-messages'
import { autoAnalyseChoicePatch, shouldOfferAutoAnalyse } from '../lib/auto-analyse-choice'
import { type DemoDownloadProgress } from '../lib/demo-download-progress'
import PostGameV3 from './v3/PostGameV3.vue'
import { matchScore } from '../lib/upforge-score'
import { refreshStudentHub } from '../components/v3/roster-flow/useStudentHub'
import { sendStateFor } from '../components/v3/roster-flow/roster-flow'
import { useCloudRetention } from '../composables/useCloudRetention'
import { postGameCloudLine } from '../lib/cloud-retention'
import { type ArchiveRetentionStats } from '../lib/archive-retention-hint'

type State = 'preparing' | 'uploading' | 'analysing' | 'ready' | 'error' | 'pending' | 'archived'
// Cloud retention (v3 post-game): how long the uploaded video stays in the cloud.
const { summary: cloudRetentionSummary } = useCloudRetention()
const postGameCloud = computed(() => postGameCloudLine(cloudRetentionSummary.value))

const COACHING_TIPS = [
  'Players who review their gameplay weekly improve 2x faster than those who don\'t.',
  'Crosshair placement accounts for up to 40% of your ability to win gunfights.',
  'Economy management separates Gold from Diamond more than aim does.',
  'The #1 mistake at every rank: pushing aggressively without information.',
  'Positioning decisions happen before the fight starts — map awareness wins rounds.',
  'Pro players spend more time watching replays than playing ranked.',
]

const state = ref<State>('preparing')
const contentRoot = ref<HTMLElement | null>(null)
const isCompactFlowState = computed(() =>
  ['preparing', 'uploading', 'analysing', 'ready', 'error', 'pending', 'archived'].includes(state.value),
)
let fitHeightTimer: ReturnType<typeof setTimeout> | null = null
let contentResizeObserver: ResizeObserver | null = null

function scheduleFitWindow(): void {
  if (fitHeightTimer) clearTimeout(fitHeightTimer)
  fitHeightTimer = setTimeout(() => {
    void nextTick(() => {
      if (!contentRoot.value || !window.api.window.setContentHeight) return
      if (!isCompactFlowState.value) return
      const height = Math.min(340, contentRoot.value.scrollHeight)
      void window.api.window.setContentHeight(height)
    })
  }, 60)
}
const uploadProgress = ref(0)
const compressing = ref(false)
const compressKind = ref<'remux' | 'transcode' | 'shrink' | null>(null)
const uploadStartedAt = ref(0)
const gameInfo = ref<{ game: string; map: string | null; agent: string | null }>({ game: 'valorant', map: null, agent: null })
const matchDataStatus = ref<'fetched' | 'no_match_id' | 'no_region' | 'no_auth' | 'fetch_failed' | 'pending'>('pending')
const killsCapured = ref(0)
const result = ref<{
  overall_score: number
  /** Stats-based UpForge score 0–1000 if a payload ever carries it; the AI result usually doesn't. */
  upforge_score?: number | null
  analysis_id: number
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  match_result?: 'win' | 'loss' | null
  ally_score?: number | null
  enemy_score?: number | null
  verdict?: string | null
  coaching_tags?: string[]
  top_issue?: string | null
  priority_improvements?: string[]
  spatial_summary?: MatchSpatialSummary | null
  category_scores?: Array<{ category: string; score: number; reasoning?: string }>
  match_highlights?: MatchHighlight[] | null
  skill_profile?: SkillProfileSnapshot | null
  timing_comparisons?: Array<{ label: string }>
  duel_moments?: DuelMoment[] | null
  pipeline?: string | null
  report_type?: string | null
  coaching_source?: string | null
  limitations?: string[]
  is_degraded?: boolean
  telemetry_fallback_used?: boolean
} | null>(null)
const sessionClips = ref<ClipRecord[]>([])
const matchId = ref<string | null>(null)

const categoryPercentiles = ref<Record<string, CategoryPercentileEntry>>({})
const percentileTier = ref<string | null>(null)

async function loadCategoryPercentiles(): Promise<void> {
  const id = result.value?.analysis_id
  if (!id) return
  categoryPercentiles.value = {}
  percentileTier.value = null
  try {
    const resp = await window.api.analyses.getPercentiles(id)
    if (resp.success && resp.percentiles && Object.keys(resp.percentiles).length > 0) {
      categoryPercentiles.value = resp.percentiles
      percentileTier.value = resp.tier ?? null
    }
  } catch { /* non-fatal */ }
}

const errorMessage = ref('')
const errorDetails = ref<AnalysisErrorPayload | null>(null)
const clipsOnlyError = ref(false)
const needsUpgrade = ref(false)
const upgradeUrl = ref('https://upforge.gg/pricing')
const userTier = ref<string>('free')
const analysesUsed = ref<number | null>(null)
const analysesLimit = ref<number | null>(null)
const archiveStats = ref<ArchiveRetentionStats | null>(null)
const subscriptionEndsAt = ref<string | null>(null)
const isTimeoutError = computed(() => errorDetails.value?.kind === 'refunded_timeout' || /timed? ?out/i.test(errorMessage.value))
const errorTitle = computed(() => {
  if (errorDetails.value?.title) return errorDetails.value.title
  if (clipsOnlyError.value) return 'Recording too large'
  if (isTimeoutError.value) return 'Analysis timed out'
  return 'Upload failed'
})
const pendingRecordingId = ref<string | null>(null)
/** 'ask' once for players with auto-analyse off who never answered; 'on' confirms a yes. */
const autoAnalyseOffer = ref<'ask' | 'on' | null>(null)
async function refreshAutoAnalyseOffer() {
  try {
    const settings = await window.api.settings.get()
    autoAnalyseOffer.value = shouldOfferAutoAnalyse(settings) ? 'ask' : null
  } catch {
    autoAnalyseOffer.value = null
  }
}
async function answerAutoAnalyse(enabled: boolean) {
  try {
    await window.api.settings.save(autoAnalyseChoicePatch(enabled))
    autoAnalyseOffer.value = enabled ? 'on' : null
  } catch {
    autoAnalyseOffer.value = null
  }
}
const submissionFocusText = ref('')
watch(pendingRecordingId, () => { submissionFocusText.value = '' })
const pendingAnalysisReady = ref(false)
const pendingAnalysisMessage = ref('Syncing match stats…')
const pendingAnalysisState = ref<string | null>(null)
const preparingSyncMessage = ref<string | null>(null)
const calmPreparing = ref(true)

const isCs2Game = computed(() => gameInfo.value.game === 'cs2')
const isLolGame = computed(() => gameInfo.value.game === 'lol')

function applyAnalysisReadiness(readiness: { ready: boolean; state: string; message: string }) {
  pendingAnalysisReady.value = readiness.ready
  pendingAnalysisState.value = readiness.state
  pendingAnalysisMessage.value = readiness.message
    || (readiness.state === 'syncing'
      ? 'Syncing match stats…'
      : readiness.state === 'finalizing'
        ? 'Finalizing recording…'
        : 'Not ready to analyse')
}

type PostGameSessionSnapshot = NonNullable<Awaited<ReturnType<NonNullable<typeof window.api.postGame>['sync']>>>
type PostGameReadyPayload = NonNullable<typeof result.value> & {
  session_start?: number
  recording_id?: string | null
  match_id?: string | null
}

function applyAnalysisProgressPayload(data: {
  progress?: number
  current_step?: string | null
  status?: string
  elapsed_ms?: number
}) {
  if (typeof data.progress === 'number') {
    analysisProgress.value = Math.min(100, Math.max(0, Math.round(data.progress)))
  }
  if (data.current_step) analysisStep.value = data.current_step
  if (data.status) analysisJobStatus.value = data.status
  if (data.elapsed_ms && data.elapsed_ms > 0) {
    const serverElapsed = Math.floor(data.elapsed_ms / 1000)
    if (serverElapsed > analysisElapsedSecs.value) analysisElapsedSecs.value = serverElapsed
  }
}

function applyAnalysisReadyPayload(r: PostGameReadyPayload) {
  clearStuckTimer()
  result.value = r
  feedbackRating.value = null
  feedbackText.value = ''
  feedbackSubmitting.value = false
  feedbackSubmitted.value = false
  feedbackError.value = null
  if (r?.recording_id) {
    sessionRecordingId.value = r.recording_id
    pendingRecordingId.value = r.recording_id
  }
  matchId.value = r?.match_id ?? null
  sessionStart = r?.session_start ?? 0
  state.value = 'ready'
  loadSessionClips()
  void refreshLocalSpatialSummary()
  void loadMyCoaches()
  void loadCategoryPercentiles()
  void window.api.profile.get().then(p => {
    if (p?.user?.analysis_stats) {
      analysesUsed.value = p.user.analysis_stats.total
      analysesLimit.value = p.user.analysis_stats.limit
    }
  }).catch(() => {})
}

function applyUploadErrorPayload(
  payload: string | AnalysisErrorPayload & {
    needsUpgrade?: boolean
    upgradeUrl?: string
    ppaUrl?: string
    clipsOnly?: boolean
    recordingId?: string
  },
) {
  needsUpgrade.value = false
  needsArchiveUpgrade.value = false
  clipsOnlyError.value = false
  savingToCloud.value = false
  archiveOnlyUpload.value = false
  if (typeof payload === 'string') {
    errorDetails.value = buildAnalysisErrorPayload(payload)
    errorMessage.value = errorDetails.value.message
  } else {
    errorDetails.value = buildAnalysisErrorPayload(payload.message, payload)
    errorMessage.value = payload.message
    if (payload.recordingId) pendingRecordingId.value = payload.recordingId
    if (payload.clipsOnly) clipsOnlyError.value = true
    if (payload.needsUpgrade) {
      needsUpgrade.value = true
      needsArchiveUpgrade.value = /archive.limit|cloud storage/i.test(payload.message)
      upgradeUrl.value = payload.upgradeUrl || 'https://upforge.gg/pricing'
    }
  }
  state.value = 'error'
}

function applyPostGameSnapshot(snapshot: PostGameSessionSnapshot): void {
  if (snapshot.game) {
    gameInfo.value = {
      game: snapshot.game,
      map: snapshot.map ?? null,
      agent: snapshot.agent ?? null,
    }
  }
  uploadProgress.value = snapshot.uploadProgress
  compressing.value = snapshot.compressing
  compressKind.value = snapshot.compressKind
  archiveOnlyUpload.value = snapshot.archiveOnly
  if (snapshot.recordingId) pendingRecordingId.value = snapshot.recordingId
  if (snapshot.matchDataStatus) {
    matchDataStatus.value = snapshot.matchDataStatus as typeof matchDataStatus.value
  }
  if (snapshot.killsInTimeline > 0) killsCapured.value = snapshot.killsInTimeline
  if (snapshot.preparingSyncMessage) preparingSyncMessage.value = snapshot.preparingSyncMessage
  if (snapshot.analysisReadiness) applyAnalysisReadiness(snapshot.analysisReadiness)
  if (snapshot.debriefLoading) debriefLoading.value = true
  if (snapshot.debriefText) {
    debriefText.value = snapshot.debriefText
    debriefFailed.value = false
    debriefLoading.value = false
  }
  if (snapshot.debriefSkipReason) debriefNotice.value = coachingSkipMessage(snapshot.debriefSkipReason)
  if (snapshot.debriefFailed) {
    debriefFailed.value = true
    debriefLoading.value = false
  }
  if (snapshot.debriefDiscordLinked) debriefDiscordLinked.value = snapshot.debriefDiscordLinked

  const next = snapshot.phase as State
  if (next === 'preparing') {
    if (
      state.value === 'uploading'
      || state.value === 'analysing'
      || state.value === 'pending'
      || state.value === 'error'
      || state.value === 'ready'
      || state.value === 'archived'
    ) {
      return
    }
    state.value = 'preparing'
    startPreparingStuckTimer()
    return
  }
  clearPreparingStuckTimer()
  state.value = next
  if (next === 'uploading' && uploadStartedAt.value === 0) uploadStartedAt.value = Date.now()
  if (next === 'analysing') startStuckTimer()
  if (next === 'pending') {
    pendingAnalysisReady.value = snapshot.pendingAnalysisReady
    pendingAnalysisMessage.value = snapshot.pendingAnalysisMessage ?? pendingAnalysisMessage.value
    pendingAnalysisState.value = snapshot.pendingAnalysisState
    void refreshLocalSpatialSummary()
  }
  applyAnalysisProgressPayload({
    progress: snapshot.analysisProgress,
    current_step: snapshot.analysisStep,
    status: snapshot.analysisJobStatus,
    elapsed_ms: snapshot.analysisElapsedMs,
  })
  analysisLongRunning.value = snapshot.analysisLongRunning
  analysisDeferredReason.value = snapshot.analysisDeferredReason
  if (snapshot.analysisResult) {
    applyAnalysisReadyPayload(snapshot.analysisResult as PostGameReadyPayload)
  } else if (snapshot.analysisError) {
    applyUploadErrorPayload(snapshot.analysisError)
  }
}

async function syncPostGameSession(): Promise<void> {
  try {
    const snapshot = await window.api.postGame.sync()
    if (snapshot) applyPostGameSnapshot(snapshot)
  } catch { /* non-fatal */ }
}
const sessionRecordingId = ref<string | null>(null)
const savingToCloud = ref(false)
const archiveOnlyUpload = ref(false)
const needsArchiveUpgrade = ref(false)
const analysisStuck = ref(false)
const analysisLongRunning = ref(false)
const analysisDeferredReason = ref<'recording' | 'server' | null>(null)
const analysisProgress = ref(0)
const analysisStep = ref<string | null>(null)
const analysisJobStatus = ref<string>('processing')
const tipIndex = ref(Math.floor(Math.random() * COACHING_TIPS.length))
const sessionClipCount = ref(0)
const analysisStartedAt = ref(0)
const analysisElapsedSecs = ref(0)
const feedbackRating = ref<'thumbs_up' | 'thumbs_down' | null>(null)
const feedbackText = ref('')
const feedbackSubmitting = ref(false)
const feedbackSubmitted = ref(false)
const feedbackError = ref<string | null>(null)
const myCoaches = ref<Array<{ coach_id: number; display_name: string; roster_is_live?: boolean; can_request_review?: boolean }>>([])
const coachesLoaded = ref(false)
const selectedCoachId = ref<number | null>(null)
const coachReviewSent = ref(false)
const coachReviewStatus = ref<'pending' | 'in_progress' | 'completed' | null>(null)
const LAST_COACH_KEY = 'upforge_last_roster_coach_id'
let debriefTimeoutTimer: ReturnType<typeof setTimeout> | null = null

function clearDebriefTimeout(): void {
  if (debriefTimeoutTimer) {
    clearTimeout(debriefTimeoutTimer)
    debriefTimeoutTimer = null
  }
}

function startDebriefTimeout(): void {
  clearDebriefTimeout()
  // Allow both 120s attempts, the 2s retry delay, and IPC delivery.
  debriefTimeoutTimer = setTimeout(() => {
    if (debriefLoading.value && !debriefText.value) {
      debriefFailed.value = true
      debriefLoading.value = false
    }
  }, 250_000)
}
let sessionStart = 0
let preparingStuckTimer: ReturnType<typeof setTimeout> | null = null
let stuckTimer: ReturnType<typeof setTimeout> | null = null
let reconcileKickTimer: ReturnType<typeof setTimeout> | null = null
let tipTimer: ReturnType<typeof setInterval> | null = null
let elapsedInterval: ReturnType<typeof setInterval> | null = null

const analysisElapsedDisplay = computed(() => {
  const s = analysisElapsedSecs.value
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m === 0) return `${sec}s`
  return `${m}m ${sec.toString().padStart(2, '0')}s`
})

const uploadStatusLabel = computed(() => {
  if (state.value === 'preparing') {
    return preparingSyncMessage.value || 'Finishing recording'
  }
  if (compressing.value) {
    if (compressKind.value === 'remux') return 'Wrapping replay'
    if (compressKind.value === 'transcode') return 'Converting replay format'
    return 'Compressing replay'
  }
  if (uploadProgress.value < 15) return 'Preparing replay'
  if (uploadProgress.value < 70) return 'Uploading recording'
  if (uploadProgress.value < 100) return 'Finalising upload'
  return 'Handing off to analysis'
})

const compressHint = computed(() => {
  if (compressKind.value === 'remux') {
    return 'OBS saved in a container format we need to wrap for upload — usually under a minute with no re-encoding.'
  }
  if (compressKind.value === 'transcode') {
    return 'OBS saved as MKV or an incompatible codec — converting before upload (one-time, may take a few minutes).'
  }
  return 'OBS recorded a large file — shrinking to upload size (one-time, may take a few minutes on CPU; faster with NVIDIA/AMD GPU).'
})

const analysisStatusLabel = computed(() => {
  const status = analysisJobStatus.value
  if (status === 'queued') return 'Queued'
  if (status === 'processing') return 'Processing'
  return 'Working'
})

const uploadEta = computed(() => {
  const pct = uploadProgress.value
  if (pct <= 0 || pct >= 100 || !uploadStartedAt.value) return null
  const elapsed = (Date.now() - uploadStartedAt.value) / 1000
  const total = elapsed / (pct / 100)
  const remaining = Math.max(0, Math.round(total - elapsed))
  if (remaining < 5) return null
  if (remaining < 60) return `~${remaining}s remaining`
  return `~${Math.ceil(remaining / 60)}m remaining`
})

const compactProgress = computed(() => {
  if (state.value === 'preparing' || state.value === 'uploading') return uploadProgress.value
  if (state.value === 'analysing') return analysisProgress.value
  return null
})

const compactTone = computed<'active' | 'paused' | 'success' | 'error' | 'neutral'>(() => {
  if (analysisDeferredReason.value === 'recording') return 'paused'
  if (state.value === 'ready' || state.value === 'archived') return 'success'
  if (state.value === 'error') return 'error'
  if (state.value === 'pending') return 'neutral'
  return 'active'
})

const compactEyebrow = computed(() => {
  if (analysisDeferredReason.value === 'recording') return 'Paused for your match'
  if (state.value === 'ready') return 'Analysis ready'
  if (state.value === 'error') return 'Needs attention'
  if (state.value === 'pending' || state.value === 'archived') return 'Match saved'
  return 'Post-match processing'
})

const compactTitle = computed(() => {
  if (state.value === 'preparing') return 'Saving your match'
  if (state.value === 'uploading') return compressing.value ? 'Optimising your recording' : 'Uploading your match'
  if (state.value === 'analysing') return analysisDeferredReason.value === 'recording'
    ? 'Background work will resume after your match'
    : 'Building your coaching report'
  if (state.value === 'ready') return 'Your coaching report is ready'
  if (state.value === 'error') return errorTitle.value
  if (state.value === 'archived') return 'Recording saved to cloud'
  return 'Your match is saved'
})

const compactBody = computed(() => {
  if (state.value === 'preparing') return 'UpForge is finalising the recording before upload.'
  if (state.value === 'uploading') return compressing.value
    ? compressHint.value
    : 'Your recording is being sent securely for analysis.'
  if (state.value === 'analysing') return analysisDeferredReason.value === 'recording'
    ? 'Nothing is broken. UpForge pauses uploads and local video work while you play to protect performance.'
    : (analysisStep.value || 'Your gameplay and match evidence are being reviewed.')
  if (state.value === 'ready') {
    const focus = focusHero.value?.headline
    return focus ? `Fix first: ${focus}` : `${matchHeadline.value} is ready to review.`
  }
  if (state.value === 'error') return errorMessage.value || 'Open UpForge to review the problem and retry.'
  if (state.value === 'archived') return 'The VOD is available from your dashboard.'
  return pendingAnalysisMessage.value || 'Open UpForge when you are ready to continue.'
})

const compactStatus = computed(() => {
  if (state.value === 'analysing') return analysisStatusLabel.value
  if (state.value === 'preparing' || state.value === 'uploading') return uploadStatusLabel.value
  return null
})

const compactTiming = computed(() => {
  if (state.value === 'analysing') return `${analysisElapsedDisplay.value} elapsed`
  return uploadEta.value
})

// UI v3: the stats-based UpForge score when present, else the coach's rating out of 10 — never the AI
// rating under the UpForge name, no letter grade (classic keeps compactScore).
const v3ScoreLine = computed(() => {
  if (state.value !== 'ready' || !result.value) return null
  const s = matchScore(result.value)
  if (!s) return null
  return s.kind === 'stats' ? `UpForge score ${s.text}` : `Coach rating ${s.text}`
})

function clearPreparingStuckTimer() {
  if (preparingStuckTimer) {
    clearTimeout(preparingStuckTimer)
    preparingStuckTimer = null
  }
}

function startPreparingStuckTimer() {
  clearPreparingStuckTimer()
  preparingStuckTimer = setTimeout(() => {
    if (state.value !== 'preparing') return
    void syncPostGameSession().then(() => {
      if (state.value !== 'preparing') return
      preparingSyncMessage.value = 'Still preparing — if this persists, close and use the dashboard to upload.'
    })
  }, 20_000)
}

function resetAnalysisUi() {
  analysisProgress.value = 0
  analysisStep.value = null
  analysisJobStatus.value = 'processing'
  analysisStuck.value = false
  analysisLongRunning.value = false
  analysisDeferredReason.value = null
}

function checkAnalysisNow() {
  void (async () => {
    try {
      await window.api.analyses.reconcileStuck()
      await window.api.recordings.get()
    } catch { /* ignore */ }
  })()
}

function startStuckTimer() {
  if (stuckTimer) clearTimeout(stuckTimer)
  if (reconcileKickTimer) clearTimeout(reconcileKickTimer)
  resetAnalysisUi()
  analysisStartedAt.value = Date.now()
  analysisElapsedSecs.value = 0
  stuckTimer = setTimeout(() => { analysisStuck.value = true }, 8 * 60 * 1000)
  reconcileKickTimer = setTimeout(checkAnalysisNow, 30_000)
  tipTimer = setInterval(() => {
    tipIndex.value = (tipIndex.value + 1) % COACHING_TIPS.length
  }, 15000)
  elapsedInterval = setInterval(() => {
    if (analysisStartedAt.value) {
      analysisElapsedSecs.value = Math.floor((Date.now() - analysisStartedAt.value) / 1000)
    }
  }, 1000)
}

function clearStuckTimer() {
  if (stuckTimer) { clearTimeout(stuckTimer); stuckTimer = null }
  if (reconcileKickTimer) { clearTimeout(reconcileKickTimer); reconcileKickTimer = null }
  if (tipTimer) { clearInterval(tipTimer); tipTimer = null }
  if (elapsedInterval) { clearInterval(elapsedInterval); elapsedInterval = null }
  analysisStuck.value = false
  analysisLongRunning.value = false
  analysisDeferredReason.value = null
}

const gameLabel = computed(() => recordingGameLabel(gameInfo.value.game))

const matchHeadline = computed(() => {
  if (gameInfo.value.game === 'cs2') {
    return gameInfo.value.map ? cs2MapDisplayName(gameInfo.value.map) : 'CS2 match'
  }
  if (gameInfo.value.game === 'deadlock') {
    return gameInfo.value.agent || gameInfo.value.map || 'Deadlock match'
  }
  if (gameInfo.value.game === 'lol') {
    return gameInfo.value.agent || "Summoner's Rift"
  }
  return gameInfo.value.agent || gameLabel.value
})

const topIssue = computed(() => {
  if (!result.value) return null
  return (result.value as Record<string, unknown>).top_issue as string | null
})

const improvements = computed<string[]>(() => {
  if (!result.value) return []
  const raw = (result.value as Record<string, unknown>).priority_improvements
  if (Array.isArray(raw)) return (raw as string[]).slice(0, 3)
  return []
})
const copiedLinkToast = ref(false)
const toastMessage = ref('Copied')
const isReady = ref(false)
const debriefText = ref<string | null>(null)
const debriefLoading = ref(false)
const debriefFailed = ref(false)
const debriefNotice = ref('')
const debriefDiscordLinked = ref(true)
const demoStatus = ref<{ status: string; jobId?: string; error?: string } | null>(null)
const demoProgress = ref(0)
const demoDownloadDetail = ref<DemoDownloadProgress | null>(null)
let copiedLinkTimer: ReturnType<typeof setTimeout> | null = null

const agentImageUrl = computed(() => {
  if (isCs2Game.value && gameInfo.value.map && isCs2Map(gameInfo.value.map)) {
    return getCs2RadarUrl(gameInfo.value.map)
  }
  if (isLolGame.value && gameInfo.value.agent) {
    return championIconUrl(gameInfo.value.agent)
  }
  return gameInfo.value.agent ? getAgentImage(gameInfo.value.agent) : ''
})
const agentImageBroken = ref(false)
watch(() => gameInfo.value.agent, () => { agentImageBroken.value = false })
watch(() => gameInfo.value.map, () => { agentImageBroken.value = false })
const mapSplashUrl = computed(() => {
  if (isCs2Game.value && gameInfo.value.map && isCs2Map(gameInfo.value.map)) {
    return getCs2RadarUrl(gameInfo.value.map)
  }
  return gameInfo.value.map ? getMapImage(gameInfo.value.map) : ''
})

const localSpatialSummary = ref<MatchSpatialSummary | null>(null)
const localDuelManifest = ref<DuelMomentManifest[]>([])
/** 0-based round worth reviewing from the local timeline (v3 "Review round N"); null hides the link. */
const localReviewRound = ref<number | null>(null)
const reviewRoundShown = computed(() => (localReviewRound.value == null ? null : localReviewRound.value + 1))

async function refreshLocalTimelineMeta() {
  const id = vodRecordingId.value
  if (!id) {
    localSpatialSummary.value = null
    localDuelManifest.value = []
    localReviewRound.value = null
    return
  }
  try {
    const tl = await window.api.recordings.getTimeline(id)
    localSpatialSummary.value = tl?.spatialSummary ?? null
    localDuelManifest.value = (tl as { duelMoments?: DuelMomentManifest[] } | null)?.duelMoments ?? []
    localReviewRound.value = reviewRoundFor(tl as unknown as ValorantTimelineLike)
  } catch {
    localSpatialSummary.value = null
    localDuelManifest.value = []
    localReviewRound.value = null
  }
}

/** @deprecated use refreshLocalTimelineMeta */
async function refreshLocalSpatialSummary() {
  await refreshLocalTimelineMeta()
}

const spatialSummary = computed((): MatchSpatialSummary | null => {
  const api = result.value?.spatial_summary ?? null
  if (api?.events?.length) return api
  if (localSpatialSummary.value?.events?.length) return localSpatialSummary.value
  return api ?? localSpatialSummary.value
})

const vodRecordingId = computed(() => sessionRecordingId.value ?? pendingRecordingId.value)

/** One glanceable line — never a paragraph above the fold. */
const focusHero = computed(() =>
  buildFocusHeroCopy({
    topIssue: topIssue.value,
    priorityImprovements: improvements.value,
    verdict: result.value?.verdict ?? null,
    heatmapInsight: spatialSummary.value?.heatmapInsight ?? spatialSummary.value?.patterns?.[0] ?? null,
    highlightReason: result.value?.match_highlights?.[0]?.reason ?? null,
    profile: result.value?.skill_profile ?? null,
  }),
)

watch(
  [state, uploadProgress, analysisProgress, analysisStep, analysisLongRunning, analysisDeferredReason, analysisStuck, errorMessage, pendingAnalysisReady],
  scheduleFitWindow,
)

watch(isReady, (ready) => { if (ready) scheduleFitWindow() })

onMounted(() => {
  window.api.discord.setState('reviewing').catch(() => {})
  window.api.app.getStatus().then(s => { if (s.user?.tier) userTier.value = s.user.tier }).catch(() => {})
  window.api.profile.get().then(p => {
    subscriptionEndsAt.value = p?.user?.analysis_stats?.subscription_ends_at ?? null
    if (p?.user?.analysis_stats) {
      analysesUsed.value = p.user.analysis_stats.total
      analysesLimit.value = p.user.analysis_stats.limit
    }
    if (p?.user?.archive_stats) archiveStats.value = p.user.archive_stats
    if (p?.user?.tier) userTier.value = p.user.tier
  }).catch(() => {})
  setTimeout(() => {
    isReady.value = true
  }, 40)
  if (typeof ResizeObserver !== 'undefined') {
    contentResizeObserver = new ResizeObserver(scheduleFitWindow)
    void nextTick(() => {
      if (contentRoot.value) contentResizeObserver?.observe(contentRoot.value)
    })
  }
  scheduleFitWindow()
  const ipcCleanup: (() => void)[] = []
  ipcCleanup.push(window.api.on('post-game:preparing', (...args: unknown[]) => {
    const data = args[0] as { game: string; map: string | null; agent: string | null; calmSave?: boolean }
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    calmPreparing.value = data.calmSave !== false
    // Ignore late preparing after the flow has already advanced (matches main-process session guard).
    if (
      state.value === 'uploading'
      || state.value === 'analysing'
      || state.value === 'pending'
      || state.value === 'error'
      || state.value === 'ready'
      || state.value === 'archived'
    ) {
      return
    }
    preparingSyncMessage.value = null
    state.value = 'preparing'
    uploadProgress.value = 0
    compressing.value = false
    compressKind.value = null
    startPreparingStuckTimer()
  }))
  ipcCleanup.push(window.api.on('post-game:prep-step', (...args: unknown[]) => {
    const data = args[0] as { recordingId?: string; game?: string; map?: string | null; agent?: string | null }
    if (data?.recordingId) pendingRecordingId.value = data.recordingId
    if (data?.game) {
      gameInfo.value = { game: data.game, map: data.map ?? null, agent: data.agent ?? null }
    }
    calmPreparing.value = false
    clearPreparingStuckTimer()
    state.value = 'uploading'
    compressing.value = false
    compressKind.value = null
    uploadProgress.value = 0
    uploadStartedAt.value = Date.now()
  }))
  ipcCleanup.push(window.api.on('post-game:compress-start', (...args: unknown[]) => {
    const data = args[0] as { sizeGB?: string }
    state.value = 'uploading'
    compressing.value = true
    uploadProgress.value = 0
    if (data?.sizeGB === 'remux') compressKind.value = 'remux'
    else if (data?.sizeGB === 'transcode') compressKind.value = 'transcode'
    else if (data?.sizeGB) compressKind.value = 'shrink'
    else compressKind.value = 'shrink'
    if (data?.sizeGB && data.sizeGB !== 'transcode' && data.sizeGB !== 'remux') {
      errorMessage.value = ''
    }
  }))
  ipcCleanup.push(window.api.on('post-game:compress-progress', (...args: unknown[]) => {
    if (analysisDeferredReason.value === 'recording') {
      analysisDeferredReason.value = null
      analysisLongRunning.value = false
    }
    state.value = 'uploading'
    compressing.value = true
    uploadProgress.value = args[0] as number
  }))
  ipcCleanup.push(window.api.on('post-game:upload-start', (...args: unknown[]) => {
    state.value = 'uploading'
    compressing.value = false
    compressKind.value = null
    uploadProgress.value = 0
    const data = args[0] as { game: string; map: string | null; agent: string | null; matchDetailsStatus?: typeof matchDataStatus.value; killsInTimeline?: number; archiveOnly?: boolean }
    archiveOnlyUpload.value = !!data.archiveOnly
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    if (data.matchDetailsStatus) matchDataStatus.value = data.matchDetailsStatus
    killsCapured.value = data.killsInTimeline ?? 0
    uploadStartedAt.value = Date.now()
  }))
  ipcCleanup.push(window.api.on('post-game:upload-progress', (...args: unknown[]) => {
    uploadProgress.value = args[0] as number
    if (analysisDeferredReason.value === 'recording') {
      analysisDeferredReason.value = null
      analysisLongRunning.value = false
    }
  }))
  ipcCleanup.push(window.api.on('post-game:upload-complete', (...args: unknown[]) => {
    const data = args[0] as { archiveOnly?: boolean } | undefined
    if (data?.archiveOnly) {
      archiveOnlyUpload.value = false
      savingToCloud.value = false
      state.value = 'archived'
      return
    }
    state.value = 'analysing'
    void refreshLocalTimelineMeta()
    startStuckTimer()
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-progress', (...args: unknown[]) => {
    applyAnalysisProgressPayload(args[0] as {
      progress?: number
      current_step?: string | null
      status?: string
      elapsed_ms?: number
    })
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-long-running', () => {
    analysisLongRunning.value = true
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-deferred', (...args: unknown[]) => {
    const data = args[0] as { reason?: 'recording' | 'server' }
    analysisDeferredReason.value = data?.reason ?? 'server'
    analysisLongRunning.value = true
  }))
  ipcCleanup.push(window.api.on('post-game:upload-deferred', (...args: unknown[]) => {
    const data = args[0] as { reason?: 'recording' | 'server' }
    analysisDeferredReason.value = data?.reason ?? 'recording'
    analysisLongRunning.value = true
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-ready', (...args: unknown[]) => {
    applyAnalysisReadyPayload(args[0] as PostGameReadyPayload)

    // Browser launch is handled by the main process (index.ts) so it fires
    // even if this window was closed before analysis completed.
  }))
  ipcCleanup.push(window.api.on('clips:new', () => {
    if (state.value === 'ready') void loadSessionClips()
  }))
  ipcCleanup.push(window.api.on('spatial:population-updated', (...args: unknown[]) => {
    const summary = args[0] as MatchSpatialSummary
    if (summary?.events?.length) localSpatialSummary.value = summary
  }))
  ipcCleanup.push(window.api.on('post-game:pending', (...args: unknown[]) => {
    const data = args[0] as {
      recordingId: string
      game: string
      map: string | null
      agent: string | null
      analysisReadiness?: { ready: boolean; state: string; message: string }
    }
    pendingRecordingId.value = data.recordingId
    gameInfo.value = { game: data.game, map: data.map, agent: data.agent }
    if (data.analysisReadiness) {
      applyAnalysisReadiness(data.analysisReadiness)
    } else {
      void refreshPendingReadiness()
    }
    state.value = 'pending'
    void refreshAutoAnalyseOffer()
    void refreshLocalSpatialSummary()
  }))
  ipcCleanup.push(window.api.on('post-game:analysis-readiness', (...args: unknown[]) => {
    const readiness = args[0] as { ready: boolean; state: string; message: string }
    if (state.value === 'preparing' || state.value === 'uploading') {
      preparingSyncMessage.value = readiness.message
        || (readiness.state === 'syncing'
            ? 'Syncing match stats…'
            : readiness.state === 'finalizing'
              ? 'Finalizing recording…'
              : 'Preparing your match for analysis')
    }
    if (state.value === 'pending') {
      applyAnalysisReadiness(readiness)
    }
  }))
  ipcCleanup.push(window.api.on('recordings:updated', () => {
    if (state.value === 'pending') void refreshPendingReadinessOnce()
  }))
  ipcCleanup.push(window.api.on('post-game:upload-error', (...args: unknown[]) => {
    applyUploadErrorPayload(args[0] as Parameters<typeof applyUploadErrorPayload>[0])
  }))
  ;(window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup = ipcCleanup

  // Debrief arrives asynchronously — show it when ready
  ipcCleanup.push(window.api.on('post-game:debrief-loading', () => {
    debriefLoading.value = true
    debriefFailed.value = false
    debriefNotice.value = ''
    startDebriefTimeout()
  }))
  ipcCleanup.push(window.api.on('post-game:debrief', (...args: unknown[]) => {
    const data = args[0] as { debrief?: string; agent?: string | null; map?: string | null; discordLinked?: boolean; skipped?: boolean; reason?: string } | null
    clearDebriefTimeout()
    if (data?.debrief) {
      debriefText.value = data.debrief
      debriefFailed.value = false
      debriefNotice.value = ''
      debriefDiscordLinked.value = data.discordLinked ?? false
    } else if (data?.skipped) {
      debriefFailed.value = false
      debriefNotice.value = coachingSkipMessage(data.reason)
    } else if (!data) {
      debriefFailed.value = true
    }
    debriefLoading.value = false
  }))

  // CS2 demo status listeners
  ipcCleanup.push(window.api.on('post-game:demo-status', (...args: unknown[]) => {
    demoStatus.value = args[0] as typeof demoStatus.value
  }))
  ipcCleanup.push(window.api.on('post-game:demo-progress', (...args: unknown[]) => {
    demoProgress.value = args[0] as number
  }))
  ipcCleanup.push(window.api.on('post-game:demo-download-progress', (...args: unknown[]) => {
    demoDownloadDetail.value = (args[0] as DemoDownloadProgress | null) ?? null
    if (!demoDownloadDetail.value) demoProgress.value = 0
  }))

  void syncPostGameSession().then(() => {
    if (debriefLoading.value) startDebriefTimeout()
  })

  // Dev preview: rich mock ready state (skip upload wait)
  if (window.location.hash.includes('post-game-preview') || window.location.pathname.includes('post-game-preview')) {
    const previewSessionStart = Date.now() - 35 * 60 * 1000
    sessionStart = previewSessionStart
    matchId.value = 'preview-match-id'
    gameInfo.value = { game: 'valorant', map: 'Bind', agent: 'Jett' }
    debriefText.value = 'You won key duels on A site but gave up map control after losing mid. Next game: default B until you have info on rotate timing.'
    debriefLoading.value = false
    result.value = {
      overall_score: 72,
      analysis_id: 999,
      kills: 18,
      deaths: 14,
      assists: 6,
      match_result: 'win',
      ally_score: 13,
      enemy_score: 11,
      top_issue: 'Positioning during post-plant — caught in the open on 4 of 6 clutch attempts.',
      priority_improvements: [
        'Hold off-angles after plant instead of wide peeking.',
        'Pre-aim head height on B site entries.',
        'Avoid force-buying after pistol loss.',
      ],
      verdict: 'Solid fragging with fixable post-plant habits.',
      coaching_tags: ['positioning', 'post_plant'],
      match_highlights: [{
        id: 'preview-h1',
        kind: 'mistake',
        title: 'Wide swing after plant',
        reason: 'You peeked A main alone with 20s left — traded 1 for 1 but lost the round win condition.',
        round: 11,
        videoOffsetMs: 312000,
        clipId: null,
        rank: 90,
      }],
    }
    sessionClipCount.value = 3
    state.value = 'ready'
    scheduleFitWindow()
  }
})

onUnmounted(() => {
  window.api.discord.setState('idle').catch(() => {})
  clearDebriefTimeout()
  clearStuckTimer()
  clearPreparingStuckTimer()
  if (copiedLinkTimer) clearTimeout(copiedLinkTimer)
  if (fitHeightTimer) clearTimeout(fitHeightTimer)
  contentResizeObserver?.disconnect()
  contentResizeObserver = null
  const cleanup = (window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup
  cleanup?.forEach(fn => fn())
  delete (window as Window & { _postGameIpcCleanup?: (() => void)[] })._postGameIpcCleanup
})

// Single-flight: post-match `recordings:updated` bursts must not stack full-list fetches.
const refreshPendingReadinessOnce = singleFlight(() => refreshPendingReadiness())

async function refreshPendingReadiness() {
  if (!pendingRecordingId.value) return
  const list = await window.api.recordings.get().catch(() => [])
  const rec = list.find((r) => r.id === pendingRecordingId.value)
  if (rec?.analysisReadiness) {
    applyAnalysisReadiness(rec.analysisReadiness)
  }
}

async function loadSessionClips() {
  try {
    const clips = await window.api.clips.get({ game: gameInfo.value.game })
    const session = filterSessionClips(clips, {
      matchId: matchId.value,
      agent: gameInfo.value.agent,
      sessionStart,
    })
    sessionClips.value = session
    sessionClipCount.value = session.length
  } catch {
    sessionClips.value = []
    sessionClipCount.value = 0
  }
}

const analysisUrl = computed(() => {
  if (!result.value?.analysis_id) return ''
  const game = isPrimaryGame(gameInfo.value.game) ? gameInfo.value.game : normalizePrimaryGame(gameInfo.value.game)
  return desktopVodResultsUrl(game as PrimaryGame, result.value.analysis_id)
})

function viewFullAnalysis() {
  if (analysisUrl.value) {
    window.open(analysisUrl.value, '_blank')
  }
  dismiss()
}

async function handleCompactPrimary() {
  if (state.value === 'ready') {
    // Results open in the main window; the web report is only the secondary link.
    if (result.value?.analysis_id) await openNativeAnalysisReview()
    else if (gameInfo.value.game === 'valorant' && matchId.value && matchId.value !== 'preview-match-id') await openMatchReport()
    else await handoffToMain({ path: '/recordings', query: { view: 'coaching' } })
    return
  }
  await handoffToMain('/dashboard')
}

/** v3: open the match page at the round worth reviewing (analysis if there is one, else the recording). */
/** Free data report for this match in the main window (Valorant). */
async function openMatchReport(): Promise<void> {
  if (matchId.value) await handoffToMain({ path: `/report/${matchId.value}` })
}

async function openReviewRound(): Promise<void> {
  const round = localReviewRound.value == null ? null : roundToQuery(localReviewRound.value)
  if (!round) return
  const analysisId = result.value?.analysis_id
  if (analysisId) {
    await handoffToMain({ path: '/vod-review', query: { timelineId: String(analysisId), round, review: '1' } })
    return
  }
  const id = vodRecordingId.value
  if (id) await handoffToMain({ path: '/vod-review', query: { id, round, review: '1' } })
}

async function openNativeAnalysisReview(): Promise<void> {
  const analysisId = result.value?.analysis_id
  if (!analysisId) {
    viewFullAnalysis()
    return
  }
  void window.api.funnel?.trackReportOpened?.({
    analysis_id: analysisId,
    source: 'desktop_post_game',
  })
  await handoffToMain({
    path: '/vod-review',
    query: { timelineId: String(analysisId) },
  })
}

async function submitAnalysisFeedback(rating: 'thumbs_up' | 'thumbs_down') {
  const analysisId = result.value?.analysis_id
  if (!analysisId || feedbackSubmitting.value || feedbackSubmitted.value) return
  feedbackRating.value = rating
  feedbackSubmitting.value = true
  feedbackError.value = null
  try {
    const res = await window.api.analyses.submitFeedback({
      analysisId,
      rating,
      feedbackText: rating === 'thumbs_down' ? feedbackText.value.trim() : undefined,
    })
    if (res.ok) {
      feedbackSubmitted.value = true
    } else {
      feedbackError.value = res.error || 'Could not save your feedback. Please try again.'
    }
  } catch {
    feedbackError.value = 'Could not save your feedback. Please try again.'
  } finally {
    feedbackSubmitting.value = false
  }
}

function selectNegativeFeedback(): void {
  feedbackRating.value = 'thumbs_down'
  feedbackError.value = null
  scheduleFitWindow()
}

function cancelNegativeFeedback(): void {
  feedbackRating.value = null
  feedbackText.value = ''
  feedbackError.value = null
  scheduleFitWindow()
}

async function loadMyCoaches() {
  coachesLoaded.value = false
  try {
    const coaches = await window.api.coach.getMyCoaches()
    myCoaches.value = coaches
    const eligible = coaches.filter(c => c.roster_is_live !== false && c.can_request_review !== false)
    const storedId = Number(localStorage.getItem(LAST_COACH_KEY))
    const storedCoach = eligible.find(c => c.coach_id === storedId)
    if (storedCoach) {
      selectedCoachId.value = storedCoach.coach_id
    } else if (eligible.length === 1) {
      selectedCoachId.value = eligible[0].coach_id
    } else if (eligible.length > 1) {
      selectedCoachId.value = eligible[0].coach_id
    } else {
      selectedCoachId.value = null
    }
    const analysisId = result.value?.analysis_id
    if (analysisId && coaches.length) {
      const existing = await window.api.coach.getAnalysisReview(analysisId).catch(() => null)
      if (existing?.source === 'roster' && ['pending', 'in_progress', 'completed'].includes(existing.status)) {
        coachReviewSent.value = true
        coachReviewStatus.value = existing.status as 'pending' | 'in_progress' | 'completed'
      } else {
        coachReviewStatus.value = null
      }
    }
  } catch {
    myCoaches.value = []
    flashToast('Could not load your coaches — try again from My Coaches on the web')
  } finally {
    coachesLoaded.value = true
  }
}

function dismiss() { window.close() }

// ---- Roster flow: "Send to coach" when this analysed match can go to a roster coach ----
const sendCoachName = ref<string | null>(null)
watch(() => [state.value, result.value?.analysis_id] as const, async ([s, id]) => {
  sendCoachName.value = null
  if (s !== 'ready' || !id) return
  const hub = await refreshStudentHub().catch(() => null)
  const send = sendStateFor(hub, id)
  if (send.kind !== 'ready') return
  const eligible = send.coaches.filter(c => c.can_request_review !== false)
  sendCoachName.value = eligible.length === 1 ? eligible[0].display_name : 'a coach'
}, { immediate: true })

async function sendToCoach() {
  const id = result.value?.analysis_id
  if (!id) return
  // The match page opens the send sheet; sending is still a deliberate tap there.
  await handoffToMain({ path: '/vod-review', query: { timelineId: String(id), sendToCoach: '1' } })
}

async function handoffToMain(target: string | { path: string; query?: Record<string, string> }) {
  try {
    await window.api.app.focusAndNavigate(target)
  } finally {
    window.close()
  }
}

function flashToast(message: string) {
  toastMessage.value = message
  copiedLinkToast.value = true
  if (copiedLinkTimer) clearTimeout(copiedLinkTimer)
  copiedLinkTimer = setTimeout(() => {
    copiedLinkToast.value = false
    copiedLinkTimer = null
  }, 2200)
}
</script>
