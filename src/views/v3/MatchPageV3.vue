<script setup lang="ts">
/**
 * UI v3 match page (VOD review). A v3 shell around the existing, working review pieces:
 * the review context is provided by VODReviewView; this file only changes layout and look.
 * The player, timeline, round log, minimap, notes, comparison and trim logic are unchanged.
 */
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useVodReview } from '../../composables/useVodReview'
import { matchRouteKey, recallMatchSummary, rememberMatchSummary, summaryFromTimeline } from '../../composables/vod/match-summary'
import { roundFromQuery } from '../../components/v3/matchpage/valorant/round-link'
import MatchPageHeaderV3 from '../../components/v3/matchpage/MatchPageHeaderV3.vue'
import MatchPageSkeletonV3 from '../../components/v3/matchpage/MatchPageSkeletonV3.vue'
import VodReviewStates from '../../components/vod-review/VodReviewStates.vue'
import VodReviewBody from '../../components/vod-review/VodReviewBody.vue'
import VodComparisonAccess from '../../components/vod-review/VodComparisonAccess.vue'
import VodReviewComparison from '../../components/vod-review/VodReviewComparison.vue'
import VodReviewShortcuts from '../../components/vod-review/VodReviewShortcuts.vue'
import CloudVodActions from '../../components/vod-review/CloudVodActions.vue'
import TrimRangeModal from '../../components/shared/TrimRangeModal.vue'
import SendToCoachV3 from '../../components/v3/roster-flow/SendToCoachV3.vue'
import CoachNotesV3 from '../../components/v3/coach-notes/CoachNotesV3.vue'
import MatchStatsDrawerV3 from '../../components/v3/matchpage/MatchStatsDrawerV3.vue'
import EnemyHabitsV3 from '../../components/v3/matchpage/EnemyHabitsV3.vue'
import RoundReviewV3 from '../../components/v3/matchpage/RoundReviewV3.vue'

defineProps<{
  accessOpen: boolean
  savedComparisonId?: string
  activeComparisonId?: string
  trialComparison: boolean
}>()
const workspace = defineModel<boolean>('workspace', { required: true })
const roundsWidth = defineModel<number>('roundsWidth', { required: true })
const detailsWidth = defineModel<number>('detailsWidth', { required: true })
const emit = defineEmits<{
  compare: []
  allowed: [id?: string, trial?: boolean]
  'close-access': []
  'close-comparison': []
  'reset-layout': []
}>()

const route = useRoute()
const {
  comparisonActive,
  videoSrc,
  timelineLoading,
  timelineError,
  trimModalOpen,
  trimStartSec,
  trimEndSec,
  trimLoading,
  trimError,
  trimHint,
  duration,
  confirmVodTrim,
  timeline,
  roundGroups,
  seekToRound,
} = useVodReview()

// `?round=N` (1-based, as shown on screen) opens the match at that round, e.g. from the post-game
// "Review this round". Seeks once, after the video knows its length.
let roundSeekDone = false
watch([() => route.query.round, roundGroups, duration], ([q, groups, dur]) => {
  if (roundSeekDone || !dur) return
  const wanted = roundFromQuery(q)
  if (wanted == null) return
  const g = groups.find(r => r.roundNumber === wanted)
  if (!g) return
  roundSeekDone = true
  seekToRound(g)
}, { immediate: true })

// Post-game "Review round N" adds `review=1`: offer that round's AI review straight away (1-based).
const autoReviewRound = computed(() => {
  if (route.query.review !== '1') return null
  const r = roundFromQuery(route.query.round)
  return r == null ? null : r + 1
})

// Header facts before the timeline lands: the clicked row, or the last visit to this match.
const routeKey = computed(() => matchRouteKey(route.query))
const summary = computed(() => recallMatchSummary(routeKey.value))
watch(timeline, t => { if (t) rememberMatchSummary(routeKey.value, summaryFromTimeline(t)) })

// Roster flow: which analysis this page shows, for "Send to coach".
const coachAnalysisId = computed(() => {
  if (timeline.value?.analysisId != null) return timeline.value.analysisId
  const q = Number(route.query.timelineId)
  return Number.isInteger(q) && q > 0 ? q : null
})
// Coach notes: the coach opened this match from their review queue.
const coachReviewId = computed(() => {
  const q = Number(route.query.coachReviewId)
  return Number.isInteger(q) && q > 0 ? q : null
})
const coachMatchLabel = computed(() => {
  const t = timeline.value as { map?: string | null; agent?: string | null } | null
  return [t?.map, t?.agent].filter(Boolean).join(' · ') || 'This match'
})
</script>

<template>
  <div class="vod-review uf-matchpage">
    <MatchPageSkeletonV3 v-if="timelineLoading" :summary="summary" :workspace="workspace" :rounds-width="roundsWidth" :details-width="detailsWidth" :cloud="!!route.query.archiveId" />
    <MatchPageHeaderV3
      v-if="!timelineLoading && !timelineError"
      v-show="!comparisonActive && !accessOpen"
      class="uf-reveal"
      :workspace="workspace"
      :can-compare="workspace && !!videoSrc"
      @compare="emit('compare')"
      @toggle-workspace="workspace = !workspace"
      @reset-layout="emit('reset-layout')"
    />

    <div v-if="!timelineLoading && !timelineError && coachReviewId != null" v-show="!comparisonActive && !accessOpen" class="uf-mp-coachrow">
      <CoachNotesV3 :review-id="coachReviewId" />
    </div>
    <div v-else-if="!timelineLoading && !timelineError && coachAnalysisId != null" v-show="!comparisonActive && !accessOpen" class="uf-mp-coachrow">
      <SendToCoachV3 :analysis-id="coachAnalysisId" :match-label="coachMatchLabel" />
    </div>
    <!-- CS2 deep tabs / Deadlock replay review (game-specific; renders nothing for other games). -->
    <MatchStatsDrawerV3 v-if="!timelineLoading && !timelineError" v-show="!comparisonActive && !accessOpen" />
    <!-- Valorant (r7-val): enemy habits this match, from Riot position snapshots. Renders nothing without enough data. -->
    <div v-if="!timelineLoading && !timelineError && timeline?.game === 'valorant'" v-show="!comparisonActive && !accessOpen" class="uf-mp-coachrow">
      <EnemyHabitsV3 :recording-id="timeline?.id ?? null" />
      <!-- AI round review: hidden unless enabled (flag + API) and the match was analysed. -->
      <RoundReviewV3 :auto-round="autoReviewRound" />
    </div>
    <CloudVodActions v-if="route.query.archiveId && !timelineLoading && !timelineError" v-show="!comparisonActive && !accessOpen" />
    <VodReviewStates v-if="timelineError && !timelineLoading" />
    <VodReviewBody v-else-if="!timelineLoading" v-show="!comparisonActive && !accessOpen" v-model:rounds-width="roundsWidth" v-model:details-width="detailsWidth" :workspace="workspace" class="uf-reveal" />

    <VodComparisonAccess v-if="accessOpen" :comparison-id="savedComparisonId" @allowed="(id?: string, trial?: boolean) => emit('allowed', id, trial)" @close="emit('close-access')" />
    <VodReviewComparison v-if="comparisonActive" :initial-comparison-id="activeComparisonId" :trial="trialComparison" @close="emit('close-comparison')" />

    <VodReviewShortcuts v-if="!comparisonActive && !accessOpen" />

    <TrimRangeModal
      :show="trimModalOpen"
      title="Trim VOD"
      confirm-label="Trim VOD"
      :duration="duration"
      :start-sec="trimStartSec"
      :end-sec="trimEndSec"
      :loading="trimLoading"
      :error="trimError"
      :hint="trimHint"
      @close="trimModalOpen = false"
      @confirm="confirmVodTrim"
      @update:start-sec="trimStartSec = $event"
      @update:end-sec="trimEndSec = $event"
    />
  </div>
</template>

<style scoped>
@import '../../components/vod-review/vod-review.css';

/* Layout: same container contract as the classic view (the workspace layout queries it). */
.uf-matchpage { display: flex; flex-direction: column; height: 100%; overflow: hidden; color: var(--uf-bone); container-type: inline-size; container-name: review-workspace; }

/* v3 restyle of the shared review pieces — surfaces flat, square, hairlines, no glow. */
.uf-matchpage.vod-review { background: var(--uf-bg); }
.uf-matchpage :deep(.vod-round-log),
.uf-matchpage :deep(.vod-side-panel),
.uf-matchpage :deep(.vod-intel-panel),
.uf-matchpage :deep(.vod-notes-panel) { background: var(--uf-chrome); box-shadow: inset 1px 0 0 var(--uf-line); }
.uf-matchpage :deep(.vod-cinema) { background: #07090c; }
.uf-matchpage :deep(.vod-cinema-frame) { box-shadow: 0 0 0 1px var(--uf-line); }
.uf-matchpage :deep(.vod-transport) { background: var(--uf-chrome); border-top: 1px solid var(--uf-line); }
.uf-matchpage :deep(.vod-transport-inner) { border-radius: 0; border-color: var(--uf-line); background: transparent; box-shadow: none; }
.uf-matchpage :deep(.vod-toolbar-btn),
.uf-matchpage :deep(.vod-side-tab) { border-radius: 0; font-family: var(--uf-body); font-size: 13px; letter-spacing: 0; text-transform: none; }
.uf-matchpage :deep(.vod-toolbar-btn--active),
.uf-matchpage :deep(.vod-side-tab--active) { border-color: transparent; background: transparent; color: var(--uf-bone); box-shadow: inset 0 -2px 0 var(--uf-red); }
.uf-matchpage :deep(.vod-round-card) { border-radius: 0; }
.uf-matchpage :deep(.vod-round-event + .vod-round-event) { border-top-color: var(--uf-line); }
.uf-matchpage :deep(.vod-intel-brief) { box-shadow: none; border-radius: 0; }
.uf-matchpage :deep(.rounded-lg),
.uf-matchpage :deep(.rounded-xl),
.uf-matchpage :deep(.rounded-2xl) { border-radius: 2px; }
.uf-mp-coachrow:empty { display: none; }
.uf-mp-coachrow { padding: 8px 40px 0; }
</style>
