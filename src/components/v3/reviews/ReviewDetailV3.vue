<script setup lang="ts">
/**
 * v3 detail pane for Coaching reviews. Same states and actions as CoachingHistoryDetail:
 * a match waiting for coaching, the archive overview, and a coached session
 * (hero, Review match / Coach notes, report, moments to revisit).
 */
import { computed, inject, ref, watch } from 'vue'
import { useCoachingHistory } from '../../../composables/useCoachingHistory'
import { statsOnlyNotice } from '../matchpage/match-page-v3'
import MatchSavedReviews from '../../coaching-history/MatchSavedReviews.vue'
import LolMatchCoaching from '../games/LolMatchCoaching.vue'
import TacticalIntelBrief from '../../TacticalIntelBrief.vue'
import MatchRecapPanel from '../../MatchRecapPanel.vue'
import TimingComparisonPanel from '../../TimingComparisonPanel.vue'
import DuelMomentCards from '../../analysis/DuelMomentCards.vue'
import UfHeroBand from '../UfHeroBand.vue'
import UfButton from '../UfButton.vue'
import UfStatRow from '../UfStatRow.vue'
import { canWatchRawRecording } from '../../../lib/recording-demo-status'
import { recordingRowStats } from '../../../lib/dashboard-match-row'
import { pendingMatchActionLabel, pendingMatchLifecycleState, pendingMatchStatusLabel } from '../../../lib/match-lifecycle'
import { ARCHIVE_DATES_KEY, pendingDot, resultTone, resultWord, reviewPlayedAt, scoreLine, statItems } from './reviews-v3'
import { formatMatchDate, matchMapLabel } from '../matches/match-meta'
import { mapDisplayName, modeDisplayName } from '../games/display-names'
import { averageMatchScore, matchScore } from '../../../lib/upforge-score'
import ScoreWhyV3 from '../score/ScoreWhyV3.vue'
import UfSkeleton from '../UfSkeleton.vue'
import { cs2StatItems, cs2StatsSourceNote } from '../../../lib/cs2-analyses'

const {
  allAnalyses,
  avgKD,
  avgScore,
  chartData,
  clearSelection,
  coachReviewSummary,
  detailLoading,
  displayAcs,
  expandedBrief,
  expandedDetail,
  hasMomentContent,
  formatGameMode,
  formatMapLabel,
  getAgentImage,
  getAgentRole,
  getMapImage,
  getMapListViewImage,
  isDisplayableGameMode,
  managePendingRecording,
  openCoachNotes,
  openPendingFootage,
  openTimeline,
  pendingBusyId,
  pendingMessage,
  primaryGame,
  runPendingPrimaryAction,
  seekAnalysisMoment,
  selectedAnalysis,
  selectedId,
  selectedRecording,
  selectedRecordingId,
  timelineLoadingId,
  topAgent,
  topMap,
  winRate,
} = useCoachingHistory()
const archiveDates = inject(ARCHIVE_DATES_KEY, null)
const statsOnly = computed(() => statsOnlyNotice(expandedDetail.value as Parameters<typeof statsOnlyNotice>[0]))

const reportOpen = ref(false)
watch(selectedId, () => { reportOpen.value = false })

const hasPlayableMoments = computed(() => Boolean(
  expandedDetail.value?.match_highlights?.length || expandedDetail.value?.timing_comparisons?.length || expandedDetail.value?.duel_moments?.length,
))
const selectedRecordingCanPlay = computed(() => (selectedRecording.value ? canWatchRawRecording(selectedRecording.value) : false))

const pendingStats = computed(() => (selectedRecording.value ? recordingRowStats(selectedRecording.value) : null))

/** Score for the hero: the analysis rounds, else the detail's ally/enemy score when it differs or is missing. */
const heroScore = computed(() => {
  const a = selectedAnalysis.value
  if (!a) return ''
  const direct = scoreLine(a)
  if (direct) return direct
  const d = expandedDetail.value
  return d && d.ally_score != null && d.enemy_score != null ? `${d.ally_score}–${d.enemy_score}` : ''
})

const heroStats = computed(() => {
  const a = selectedAnalysis.value
  if (!a) return []
  const items = statItems({ ...a, combat_score: null, acs: displayAcs(a) })
  // CS2: ADR and KAST from the demo sit next to K/D/A (CS2 has no ACS).
  if (a.cs2_source) items.splice(items.findIndex(i => i.label === 'K/D/A') + 1, 0, ...cs2StatItems(a))
  const uf = selectedScore.value
  if (uf) items.push({ value: uf.text, label: uf.kind === 'stats' ? 'UpForge' : 'Coach rating' })
  return items
})

/** Stats-based UpForge score (list row or detail), else the coach rating out of 10. */
const selectedScore = computed(() => {
  const a = selectedAnalysis.value
  if (!a) return null
  return matchScore({ upforge_score: a.upforge_score ?? expandedDetail.value?.upforge_score, overall_score: a.overall_score })
})
const scoreBreakdown = computed(() => (selectedScore.value?.kind === 'stats' ? expandedDetail.value?.upforge_score_breakdown ?? null : null))

/** CS2 archive: `agent` holds the player's name (not an agent), maps are "de_" ids. */
const isCs2Archive = computed(() => allAnalyses.value.some(a => !!a.cs2_source))

const heroMeta = computed(() => {
  const a = selectedAnalysis.value
  if (!a) return ''
  // CS2 rows carry the player's name in `agent` and "CS2 VOD" as the mode: no agent role, no "Cs2 Vod".
  if (a.cs2_source) {
    return [a.map ? mapDisplayName('cs2', a.map) : 'Unknown map', a.agent, modeDisplayName('cs2', a.game_mode),
      formatMatchDate(reviewPlayedAt(a, archiveDates?.value))].filter(Boolean).join(' · ')
  }
  const parts = [a.map ? matchMapLabel(null, a.map) : 'Unknown map', a.agent || 'Unknown agent']
  if (a.agent) parts.push(getAgentRole(a.agent))
  if (isDisplayableGameMode(a.game_mode)) parts.push(formatGameMode(a.game_mode))
  parts.push(formatMatchDate(reviewPlayedAt(a, archiveDates?.value)))
  if (a.rank && a.rank.trim().toLowerCase() !== 'unknown') parts.push(a.rank)
  return parts.join(' · ')
})

const overviewStats = computed(() => [
  { value: String(allAnalyses.value.length), caption: 'Games coached' },
  { value: `${winRate.value}%`, caption: 'Win rate', tone: winRate.value >= 50 ? 'win' as const : 'loss' as const },
  avgScoreItem.value,
  { value: avgKD.value, caption: 'Average K/D' },
].filter((i): i is NonNullable<typeof i> => i != null))

/** Average stats score over scored matches only; else the coach-rating average; else nothing (no fake numbers). */
const avgScoreItem = computed(() => {
  const uf = averageMatchScore(allAnalyses.value)
  if (uf) return { value: String(uf.value), caption: 'Average UpForge score', sub: `${uf.count} scored ${uf.count === 1 ? 'match' : 'matches'}` }
  const coach = matchScore({ overall_score: avgScore.value })
  return coach ? { value: coach.text, caption: 'Average coach rating' } : null
})
/** The trend line plots the coach's ratings (overall_score), so it is labelled as such. */
const trendLast = computed(() => (chartData.value ? matchScore({ overall_score: chartData.value.last })?.text ?? '' : ''))
</script>

<template>
  <div class="rv3-detail" :class="{ 'is-empty': selectedId == null && selectedRecordingId == null }">
    <button v-if="selectedId || selectedRecordingId" type="button" class="uf-link rv3-back" @click="clearSelection">All reviews</button>

    <!-- A match that hasn't been coached yet -->
    <div v-if="selectedRecording" class="rv3-pad uf-rise">
      <div class="rv3-pending-head">
        <span class="rv3-thumb-lg">
          <img v-if="selectedRecording.map && getMapListViewImage(selectedRecording.map)" :src="getMapListViewImage(selectedRecording.map)" alt="" class="rv3-map">
          <img v-if="selectedRecording.agent && getAgentImage(selectedRecording.agent)" :src="getAgentImage(selectedRecording.agent)" alt="" class="rv3-agent">
        </span>
        <div class="rv3-col">
          <span class="uf-label">{{ selectedRecording.productionFixture ? 'Production fixture · before coaching' : 'Before coaching' }}</span>
          <span class="uf-d2">{{ selectedRecording.agent || 'Unknown player' }}</span>
          <span class="uf-t4">{{ formatMapLabel(selectedRecording.map) || 'Unknown map' }} · {{ new Date(selectedRecording.recordedAt).toLocaleString() }}</span>
        </div>
      </div>

      <div v-if="pendingStats && (scoreLine(pendingStats) || statItems(pendingStats).length)" class="rv3-inline-stats">
        <span v-if="scoreLine(pendingStats)" class="uf-d4" :style="{ color: resultTone(pendingStats) === 'win' ? 'var(--uf-win)' : resultTone(pendingStats) === 'loss' ? 'var(--uf-loss)' : undefined }">
          {{ resultWord(pendingStats) }} {{ scoreLine(pendingStats) }}
        </span>
        <span v-for="s in statItems(pendingStats)" :key="s.label" class="rv3-stat"><span class="uf-d4">{{ s.value }}</span><span class="uf-t4">{{ s.label }}</span></span>
      </div>

      <div class="uf-hair" />
      <div class="rv3-col" style="gap: 6px">
        <span class="rv3-status uf-t3">
          <span class="rv3-dot" :class="{ 'uf-live': pendingDot(pendingMatchLifecycleState(selectedRecording)).live }" :style="{ background: pendingDot(pendingMatchLifecycleState(selectedRecording)).color }" aria-hidden="true" />
          {{ pendingMatchStatusLabel(selectedRecording) }}
        </span>
        <span class="uf-t2">{{ selectedRecording.analysisReadiness?.message || 'UpForge is preparing this match for coaching.' }}</span>
        <span v-if="selectedRecording.productionFixture" class="uf-t4">Read-only production data. Analyse, sync and delete actions do not change production.</span>
        <span v-if="pendingMessage" class="uf-t4" role="status">{{ pendingMessage }}</span>
      </div>
      <div class="rv3-actions">
        <UfButton v-if="pendingMatchActionLabel(selectedRecording)" variant="primary" icon="spark" :disabled="pendingBusyId === selectedRecording.id" @click="runPendingPrimaryAction(selectedRecording)">
          {{ pendingBusyId === selectedRecording.id ? 'Working…' : pendingMatchActionLabel(selectedRecording) }}
        </UfButton>
        <UfButton v-if="selectedRecordingCanPlay" icon="play" @click="openPendingFootage(selectedRecording)">Watch footage</UfButton>
        <UfButton variant="link" @click="managePendingRecording(selectedRecording)">Manage footage</UfButton>
      </div>
    </div>

    <!-- Archive overview (nothing selected) -->
    <div v-else-if="!selectedAnalysis" class="rv3-pad uf-rise">
      <div class="rv3-col" style="gap: 8px">
        <span class="uf-label">Your coaching archive</span>
        <p v-if="allAnalyses.length" class="uf-t2" style="margin: 0">Pick a review from the list to read its coaching and open the footage.</p>
      </div>
      <template v-if="allAnalyses.length">
        <UfStatRow :items="overviewStats" />
        <div v-if="(topAgent && !isCs2Archive) || topMap" class="rv3-tops">
          <div v-if="topAgent && !isCs2Archive" class="rv3-top">
            <img v-if="getAgentImage(topAgent)" :src="getAgentImage(topAgent)" alt="" class="rv3-top-img">
            <span class="rv3-col"><span class="uf-label">Most played agent</span><span class="uf-t3">{{ topAgent }}</span></span>
          </div>
          <div v-if="topMap" class="rv3-top">
            <img v-if="getMapListViewImage(topMap)" :src="getMapListViewImage(topMap)" alt="" class="rv3-top-map">
            <span class="rv3-col"><span class="uf-label">Top map</span><span class="uf-t3">{{ isCs2Archive ? mapDisplayName('cs2', topMap) : formatMapLabel(topMap) }}</span></span>
          </div>
        </div>
        <div v-if="chartData" class="rv3-col" style="gap: 10px">
          <div class="rv3-chart-head"><span class="uf-label">Coach rating trend</span><span class="uf-d4" :style="{ color: chartData.up ? 'var(--uf-win)' : 'var(--uf-loss)' }">{{ chartData.up ? '↑' : '↓' }} {{ trendLast }}</span></div>
          <svg width="100%" :height="chartData.H" :viewBox="`0 0 ${chartData.W} ${chartData.H}`" preserveAspectRatio="none" class="rv3-chart" role="img" :aria-label="`Coach rating trend, latest ${trendLast}, ${chartData.up ? 'rising' : 'falling'}`">
            <defs>
              <linearGradient id="rv3-trend" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" :style="{ stopColor: chartData.up ? 'var(--uf-win)' : 'var(--uf-loss)' }" stop-opacity="0.3" />
                <stop offset="100%" :style="{ stopColor: chartData.up ? 'var(--uf-win)' : 'var(--uf-loss)' }" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line v-for="gl in chartData.gridLines" :key="gl.score" :x1="chartData.pad" :y1="gl.y" :x2="chartData.W - chartData.pad" :y2="gl.y" stroke="rgba(236,232,225,0.06)" stroke-width="0.75" />
            <path :d="chartData.areaPath" fill="url(#rv3-trend)" />
            <path :d="chartData.linePath" fill="none" :style="{ stroke: chartData.up ? 'var(--uf-win)' : 'var(--uf-loss)' }" stroke-width="2" stroke-linejoin="round" />
          </svg>
          <div class="rv3-chart-head"><span class="uf-t4">{{ chartData.firstDate }}</span><span class="uf-t4">{{ chartData.lastDate }}</span></div>
        </div>
      </template>
      <p v-else class="uf-t4" style="margin: 0">No coached matches yet. Your first review will start this archive.</p>
    </div>

    <!-- A coached session -->
    <div v-else class="rv3-session">
      <UfHeroBand
        :art="selectedAnalysis.map ? getMapImage(selectedAnalysis.map) || undefined : undefined"
        :tone="resultTone(selectedAnalysis)"
        :result="resultWord(selectedAnalysis)"
        :meta="heroMeta"
        :height="288"
      >
        <span v-if="heroScore" class="uf-d1">{{ heroScore }}</span>
        <span v-else class="uf-d2">{{ selectedAnalysis.agent || 'Coached match' }}</span>
        <template #stats>
          <span v-for="s in heroStats" :key="s.label" class="rv3-stat"><span class="uf-d4">{{ s.value }}</span><span class="uf-t4">{{ s.label }}</span></span>
        </template>
      </UfHeroBand>

      <div class="rv3-pad">
        <div class="rv3-actions uf-rise uf-d2s">
          <UfButton variant="primary" icon="play" :disabled="timelineLoadingId === selectedAnalysis.id" @click="openTimeline(selectedAnalysis.id)">
            {{ timelineLoadingId === selectedAnalysis.id ? 'Opening VOD…' : 'Review match' }}
          </UfButton>
          <UfButton v-if="coachReviewSummary?.status === 'completed'" icon="chat" :disabled="timelineLoadingId === selectedAnalysis.id" @click="openCoachNotes(selectedAnalysis.id)">Coach notes</UfButton>
          <span v-if="selectedScore?.kind === 'stats'" class="uf-t4">{{ selectedScore.label }}</span>
          <span v-if="cs2StatsSourceNote(selectedAnalysis)" class="uf-t4">{{ cs2StatsSourceNote(selectedAnalysis) }}</span>
        </div>

        <ScoreWhyV3 v-if="selectedScore?.kind === 'stats' && scoreBreakdown" :score="selectedScore.value" :breakdown="scoreBreakdown" />

        <div v-if="primaryGame === 'lol' && expandedDetail?.summary" class="rv3-col" style="gap: 6px">
          <span class="uf-label">League coaching summary</span>
          <p class="uf-t2" style="margin: 0">{{ expandedDetail.summary }}</p>
        </div>

        <div v-if="detailLoading" class="rv3-col" role="status" aria-label="Loading coaching detail" style="gap: 14px">
          <UfSkeleton :h="44" />
          <UfSkeleton :lines="3" />
          <UfSkeleton :h="120" />
        </div>

        <template v-else>
          <div class="rv3-legacy"><MatchSavedReviews :analysis-id="selectedAnalysis.id" /></div>
          <LolMatchCoaching v-if="primaryGame === 'lol' && selectedAnalysis.match_id" :match-id="selectedAnalysis.match_id" />

          <section class="rv3-report">
            <button type="button" class="rv3-toggle" :aria-expanded="reportOpen" aria-controls="rv3-coaching-report" @click="reportOpen = !reportOpen">
              <span class="uf-t3">Coaching report</span><span class="uf-t4">{{ reportOpen ? 'Hide report' : 'Read report' }}</span>
            </button>
            <div v-show="reportOpen" id="rv3-coaching-report" class="rv3-col rv3-legacy" style="gap: 16px; padding-top: 12px">
              <p v-if="statsOnly" class="uf-t4" style="margin: 0" role="note">
                <span style="color: var(--uf-gold); font-weight: 600">{{ statsOnly.title }}.</span>
                {{ statsOnly.message }}<template v-if="statsOnly.limitation"> {{ statsOnly.limitation }}</template>
              </p>
              <TacticalIntelBrief v-if="expandedBrief" :brief="expandedBrief" />
              <div v-else-if="coachReviewSummary?.status === 'completed'" class="rv3-col" style="gap: 4px">
                <span class="uf-label">Coach feedback ready</span>
                <span class="uf-t2">Open the VOD review for timeline notes<template v-if="coachReviewSummary.annotationCount"> ({{ coachReviewSummary.annotationCount }})</template>.</span>
              </div>
              <div v-else-if="coachReviewSummary?.status === 'in_progress'" class="rv3-col" style="gap: 4px">
                <span class="uf-label">Coach reviewing</span>
                <span class="uf-t2">You'll get a notification when notes are ready.</span>
              </div>
              <div v-else-if="expandedDetail?.heatmap_insight" class="rv3-col" style="gap: 4px">
                <span class="uf-label">Map intel</span>
                <span class="uf-t2">{{ expandedDetail.heatmap_insight }}</span>
              </div>
              <div v-else-if="expandedDetail?.verdict" class="rv3-col" style="gap: 4px">
                <span class="uf-label">Coach verdict</span>
                <span class="uf-t2">{{ expandedDetail.verdict }}</span>
              </div>
              <div v-if="expandedDetail?.priority_improvements?.length && !expandedBrief?.improvements.length" class="rv3-col" style="gap: 8px">
                <span class="uf-label">Focus areas</span>
                <div v-for="(imp, i) in expandedDetail.priority_improvements.slice(0, 3)" :key="i" class="rv3-focus-row">
                  <span class="uf-d4" :style="{ color: i === 0 ? 'var(--uf-red)' : 'var(--uf-faint)' }">{{ i + 1 }}</span>
                  <span class="uf-t2">{{ imp }}</span>
                </div>
              </div>
              <p v-if="!hasMomentContent && !expandedBrief" class="uf-t4" style="margin: 0">No structured coaching notes for this session.</p>
            </div>
          </section>

          <section v-if="hasPlayableMoments" aria-labelledby="rv3-moments-title" class="rv3-col" style="gap: 12px">
            <div class="rv3-chart-head">
              <span id="rv3-moments-title" class="uf-label">Moments to revisit</span>
              <span class="uf-t4">Select a moment to open the footage</span>
            </div>
            <div class="rv3-moments rv3-legacy">
              <MatchRecapPanel
                v-if="expandedDetail?.match_highlights?.length"
                :priority-improvements="expandedDetail.priority_improvements"
                :top-issue="expandedDetail.top_issue"
                :coaching-tags="expandedDetail.coaching_tags"
                :spatial-summary="expandedDetail.spatial_summary"
                :api-highlights="expandedDetail.match_highlights"
                @seek="seekAnalysisMoment"
              />
              <TimingComparisonPanel v-if="expandedDetail?.timing_comparisons?.length" :comparisons="expandedDetail.timing_comparisons" @seek="seekAnalysisMoment" />
              <details v-if="expandedDetail?.duel_moments?.length" class="rv3-duels">
                <summary class="rv3-toggle"><span class="uf-t3">Duel analysis</span><span class="uf-t4">{{ expandedDetail.duel_moments.length }} moments · expand</span></summary>
                <DuelMomentCards :moments="expandedDetail.duel_moments" @seek="(ms) => seekAnalysisMoment(Math.max(0, ms - 3000))" />
              </details>
            </div>
          </section>
          <div v-else class="rv3-col" style="gap: 4px">
            <span class="uf-t3">Review at your own pace</span>
            <span class="uf-t4">No moment cards for this match. Open the review to explore the footage.</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rv3-detail { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.rv3-back { display: none; padding: 14px 24px 0; text-align: left; }
.rv3-pad { padding: 26px 32px 32px; display: flex; flex-direction: column; gap: 22px; }
.rv3-session { display: flex; flex-direction: column; }
.rv3-col { display: flex; flex-direction: column; }
.rv3-stat { display: inline-flex; gap: 8px; align-items: baseline; }
.rv3-inline-stats { display: flex; flex-wrap: wrap; gap: 26px; align-items: baseline; }
.rv3-actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.rv3-pending-head { display: flex; gap: 18px; align-items: center; }
.rv3-thumb-lg { position: relative; width: 132px; height: 74px; flex: none; overflow: hidden; background: var(--uf-raised); }
.rv3-map { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
.rv3-agent { position: absolute; right: 0; bottom: 0; height: 100%; width: auto; }
.rv3-status { display: inline-flex; align-items: center; gap: 8px; }
.rv3-dot { width: 6px; height: 6px; border-radius: 3px; flex: none; }
.rv3-tops { display: flex; gap: 40px; padding-top: 18px; border-top: 1px solid var(--uf-line); }
.rv3-top { display: flex; gap: 14px; align-items: center; }
.rv3-top-img { width: 44px; height: 44px; object-fit: contain; background: var(--uf-raised); }
.rv3-top-map { width: 80px; height: 44px; object-fit: cover; }
.rv3-chart-head { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
.rv3-chart { display: block; height: 96px; }
.rv3-report { border-top: 1px solid var(--uf-line); padding-top: 4px; }
.rv3-toggle { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; min-height: 44px; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; list-style: none; }
.rv3-toggle::-webkit-details-marker { display: none; }
.rv3-focus-row { display: flex; gap: 14px; align-items: baseline; }
.rv3-moments { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); align-items: start; gap: 16px; }
.rv3-duels { grid-column: 1 / -1; border-top: 1px solid var(--uf-line); padding-top: 4px; }
/* Reused coaching panels: square them off and drop their boxes so they sit on hairlines. */
.rv3-legacy :deep([class*='rounded']) { border-radius: 0 !important; }
.rv3-legacy :deep(.dash-panel) { background: transparent !important; border: 0 !important; border-top: 1px solid var(--uf-line) !important; box-shadow: none !important; padding-left: 0 !important; padding-right: 0 !important; }
.rv3-legacy :deep([class*='shadow']) { box-shadow: none !important; }
@media (max-width: 1023px) {
  .rv3-detail.is-empty { display: none; }
  .rv3-back { display: block; }
}
</style>
