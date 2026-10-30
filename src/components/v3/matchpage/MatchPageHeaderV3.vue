<script setup lang="ts">
/**
 * UI v3 match page header: compact hero (map art, result, score, K/D/A), one row of
 * section tabs + every action the old command bar offered, the coach's sentence and the
 * rounds line. All data comes from the injected review context.
 */
import { computed, ref } from 'vue'
import { useVodReview } from '../../../composables/useVodReview'
import UfHeroBand from '../UfHeroBand.vue'
import UfTabs from '../UfTabs.vue'
import UfButton from '../UfButton.vue'
import UfIcon from '../UfIcon.vue'
import UfRoundsLine from '../UfRoundsLine.vue'
import UfSkeleton from '../UfSkeleton.vue'
import { deadlockRecordingHero, loadDeadlockHeroesOnce } from '../../../lib/deadlock-hero-names'
import { matchReportPath } from '../../../lib/match-report'
import { coachLine, firstDeathEvent, matchResult, roundsForLine, sideTab, statsOnlyNotice, type MatchSideTab } from './match-page-v3'

const props = defineProps<{ workspace: boolean; canCompare: boolean }>()
const emit = defineEmits<{ 'toggle-workspace': []; 'reset-layout': []; compare: [] }>()

const {
  activeRoundNumber,
  agentImageUrl,
  allTimelineEvents,
  canTrimLocalVod,
  coachingDetail,
  detailLoading,
  displayGameMode,
  hasCoachFeedback,
  hasSpatialIntel,
  isRoundBased,
  mapPosterUrl,
  matchScoreline,
  openVodTrim,
  roundGroups,
  roundLogCollapsed,
  roundRecord,
  router,
  seekToEvent,
  seekToRound,
  setSidePanelTab,
  showInsightsPanel,
  showShortcuts,
  spatialMapVisible,
  theaterMode,
  timeline,
  toggleTheaterMode,
  videoSrc,
  recordingId,
} = useVodReview()

const result = computed(() => matchResult(matchScoreline.value, timeline.value?.finalStats?.won))
/** Valorant matches with a Riot match id have a free data report. */
/** Free data report for this match (Valorant, League, Deadlock by match id; CS2 by recording). */
const reportPath = computed(() => matchReportPath(timeline.value?.game, timeline.value?.matchId, recordingId.value))
// Deadlock recordings store `hero_<id>`; show the hero's name (or "Unknown hero"), never the key.
const isDeadlockMatch = computed(() => timeline.value?.game === 'deadlock')
if (isDeadlockMatch.value) void loadDeadlockHeroesOnce()
const agentLabel = computed(() => isDeadlockMatch.value ? deadlockRecordingHero(timeline.value?.agent) : timeline.value?.agent)
const meta = computed(() => [timeline.value?.map, displayGameMode.value, agentLabel.value].filter(Boolean).join(' · '))
const stats = computed(() => timeline.value?.finalStats ?? null)

const tab = computed<MatchSideTab>(() => sideTab(showInsightsPanel.value, spatialMapVisible.value))
const tabs = computed(() => [
  { key: 'replay', label: 'Replay' },
  { key: 'notes', label: hasCoachFeedback.value ? 'Coach notes' : 'Notes', count: hasCoachFeedback.value && !showInsightsPanel.value ? 'new' : null },
  ...(hasSpatialIntel.value ? [{ key: 'map', label: 'Map' }] : []),
])
function onTab(key: string) {
  setSidePanelTab(key === 'replay' ? null : (key as 'notes' | 'map'))
}

const roundBars = computed(() => (isRoundBased.value ? roundsForLine(roundGroups.value, allTimelineEvents.value) : []))
const selectedRound = computed(() => {
  if (activeRoundNumber.value == null) return null
  const i = roundGroups.value.findIndex(r => r.roundNumber === activeRoundNumber.value)
  return i >= 0 ? i + 1 : null
})
function onRoundSelect(n: number) {
  const g = roundGroups.value[n - 1]
  if (g) seekToRound(g)
}
const markedCount = computed(() => roundBars.value.filter(r => r.marked).length)

const coach = computed(() => coachLine(coachingDetail.value, roundGroups.value, allTimelineEvents.value, isRoundBased.value))
const statsOnly = computed(() => statsOnlyNotice(coachingDetail.value as Parameters<typeof statsOnlyNotice>[0]))
const firstDeath = computed(() => (videoSrc.value ? firstDeathEvent(allTimelineEvents.value) : null))
function watchFirstDeath() {
  if (firstDeath.value) seekToEvent(firstDeath.value)
}

const layoutOpen = ref(false)
function back() { router.back() }
const workspaceOn = computed(() => props.workspace)
</script>

<template>
  <header class="uf-mp-head" @keydown.stop>
    <UfHeroBand :art="mapPosterUrl || undefined" :result="result?.word" :tone="result?.tone ?? 'none'" :meta="meta" :height="150" art-position="center 45%">
      <div class="uf-mp-score">
        <img v-if="agentImageUrl" :src="agentImageUrl" alt="" class="uf-mp-agent">
        <span v-if="matchScoreline" class="uf-d2 uf-num">{{ matchScoreline.ally }}<span class="uf-mp-dash">–</span>{{ matchScoreline.enemy }}</span>
        <span v-else class="uf-d2">{{ agentLabel || 'Match replay' }}</span>
      </div>
      <template #stats>
        <span v-if="stats" class="uf-mp-stat"><span class="uf-d4 uf-num">{{ stats.kills }}/{{ stats.deaths }}/{{ stats.assists }}</span><span class="uf-t4">K/D/A</span></span>
        <span v-if="roundRecord" class="uf-mp-stat"><span class="uf-d4 uf-num">{{ roundRecord.wins }}–{{ roundRecord.losses }}</span><span class="uf-t4">rounds</span></span>
        <span v-if="isRoundBased && markedCount > 0" class="uf-mp-stat"><span class="uf-d4 uf-num">{{ markedCount }}</span><span class="uf-t4">rounds you died first</span></span>
      </template>
    </UfHeroBand>

    <div class="uf-mp-bar">
      <button type="button" class="uf-link uf-mp-back" @click="back">← Back</button>
      <UfTabs :items="tabs" :model-value="tab" label="Match sections" @update:model-value="onTab" />
      <button v-if="reportPath" type="button" class="uf-link" title="Free data report for this match" @click="router.push(reportPath)">Match report</button>
      <div class="uf-mp-spacer" />
      <div class="uf-mp-tools">
        <button v-if="!theaterMode && roundGroups.length" type="button" class="uf-mp-tool" :aria-pressed="!roundLogCollapsed"
          :title="`${roundLogCollapsed ? 'Show' : 'Hide'} ${isRoundBased ? 'round log' : 'match timeline'} (B)`" @click="roundLogCollapsed = !roundLogCollapsed">
          {{ isRoundBased ? 'Rounds' : 'Timeline' }}
        </button>
        <button v-if="canTrimLocalVod" type="button" class="uf-mp-tool" title="Trim local recording file" @click="openVodTrim">Trim</button>
        <button v-if="timeline?.videoPath" type="button" class="uf-mp-tool" :aria-pressed="theaterMode"
          :title="theaterMode ? 'Exit theater (T)' : 'Theater mode (T)'" @click="toggleTheaterMode">
          {{ workspaceOn ? (theaterMode ? 'Restore panels' : 'Focus video') : (theaterMode ? 'Exit theater' : 'Theater') }}
        </button>
        <button type="button" class="uf-mp-tool" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" @click="showShortcuts = true">?</button>
        <div v-if="workspaceOn" class="uf-mp-layout">
          <button type="button" class="uf-mp-tool" :aria-expanded="layoutOpen" @click="layoutOpen = !layoutOpen" @keydown.esc="layoutOpen = false">Layout</button>
          <div v-if="layoutOpen" class="uf-mp-menu" @click="layoutOpen = false">
            <button type="button" @click="emit('reset-layout')">Reset layout</button>
            <button type="button" @click="emit('toggle-workspace')">Use classic layout</button>
          </div>
        </div>
        <button v-else type="button" class="uf-mp-tool" @click="emit('toggle-workspace')">Try workspace</button>
      </div>
      <UfButton v-if="canCompare" icon="swap" @click="emit('compare')">Compare moments</UfButton>
      <UfButton v-if="firstDeath" variant="primary" icon="play" @click="watchFirstDeath">Watch first death</UfButton>
    </div>

    <div v-if="coach || roundBars.length || detailLoading" class="uf-mp-story">
      <!-- Hold the sentence until coaching detail lands, so a data-only line never swaps for the coach's. -->
      <p v-if="coach && !detailLoading" class="uf-mp-coach uf-reveal">
        <UfIcon name="chat" :size="15" />
        <span class="uf-t4">{{ coach.source === 'coach' ? 'Your coach' : 'From the match data' }}</span>
        <span class="uf-t3">{{ coach.text }}</span>
      </p>
      <UfSkeleton v-else-if="detailLoading" :w="'min(720px, 70%)'" :h="18" />
      <p v-if="statsOnly && !detailLoading" class="uf-t4 uf-reveal" style="margin: 0" role="note">
        <span style="color: var(--uf-gold); font-weight: 600">{{ statsOnly.title }}.</span>
        {{ statsOnly.message }}<template v-if="statsOnly.limitation"> {{ statsOnly.limitation }}</template>
      </p>
      <div v-if="roundBars.length" class="uf-mp-rounds">
        <div class="uf-mp-rounds-head">
          <span class="uf-label">Rounds</span>
          <span class="uf-mp-legend">
            <span><i class="uf-mp-key uf-mp-key--win" />Won</span>
            <span><i class="uf-mp-key" />Lost</span>
            <span v-if="markedCount > 0"><i class="uf-mp-key uf-mp-key--mark" />You died first</span>
          </span>
        </div>
        <UfRoundsLine :rounds="roundBars" :selected="selectedRound" :height="22" @select="onRoundSelect" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.uf-mp-head { flex: none; display: flex; flex-direction: column; background: var(--uf-bg); border-bottom: 1px solid var(--uf-line); }
.uf-mp-score { display: flex; align-items: center; gap: 16px; }
.uf-mp-agent { width: 44px; height: 44px; object-fit: contain; background: var(--uf-raised); }
.uf-mp-dash { color: var(--uf-faint); padding: 0 10px; }
.uf-mp-stat { display: inline-flex; align-items: baseline; gap: 8px; }
.uf-mp-bar { display: flex; align-items: center; gap: 18px; padding: 10px 40px; border-top: 1px solid var(--uf-line); flex-wrap: wrap; }
.uf-mp-back { flex: none; }
.uf-mp-spacer { flex: 1; }
.uf-mp-tools { display: flex; align-items: center; gap: 4px; }
.uf-mp-tool { height: 32px; padding: 0 10px; background: none; border: 0; color: var(--uf-muted); font: 600 13px/1 var(--uf-body); cursor: pointer; }
.uf-mp-tool:hover { color: var(--uf-bone); background: var(--uf-hover); }
.uf-mp-tool[aria-pressed='true'] { color: var(--uf-bone); box-shadow: inset 0 -2px 0 var(--uf-red); }
.uf-mp-layout { position: relative; }
.uf-mp-menu { position: absolute; top: 100%; right: 0; z-index: 40; display: grid; min-width: 180px; padding: 4px 0; background: var(--uf-raised); border: 1px solid var(--uf-line-2); }
.uf-mp-menu button { padding: 10px 14px; text-align: left; background: none; border: 0; color: var(--uf-bone); font: 400 13px/1.4 var(--uf-body); cursor: pointer; }
.uf-mp-menu button:hover { background: var(--uf-hover); }
.uf-mp-story { display: flex; flex-direction: column; gap: 12px; padding: 12px 40px 14px; border-top: 1px solid var(--uf-line); }
.uf-mp-coach { margin: 0; display: flex; align-items: baseline; gap: 10px; color: var(--uf-faint); }
.uf-mp-coach svg { align-self: center; }
.uf-mp-rounds { display: flex; flex-direction: column; gap: 8px; max-width: 760px; }
.uf-mp-rounds-head { display: flex; justify-content: space-between; align-items: center; }
.uf-mp-legend { display: flex; gap: 16px; font: 400 13px/1.4 var(--uf-body); color: var(--uf-faint); }
.uf-mp-legend span { display: inline-flex; align-items: center; gap: 6px; }
.uf-mp-key { display: inline-block; width: 9px; height: 9px; background: rgba(236, 232, 225, 0.22); }
.uf-mp-key--win { background: var(--uf-win); }
.uf-mp-key--mark { width: 12px; height: 3px; background: var(--uf-red); }
</style>
