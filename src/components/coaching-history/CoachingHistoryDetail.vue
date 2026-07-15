<script setup lang="ts">
import { computed } from 'vue'
import { useCoachingHistory } from '../../composables/useCoachingHistory'
import TacticalIntelBrief from '../TacticalIntelBrief.vue'
import MatchRecapPanel from '../MatchRecapPanel.vue'
import TimingComparisonPanel from '../TimingComparisonPanel.vue'
import DuelMomentCards from '../analysis/DuelMomentCards.vue'

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
  formatDate,
  formatGameMode,
  formatMapLabel,
  getAgentColor,
  getAgentImage,
  getAgentRole,
  getMapImage,
  getMapListViewImage,
  getRankHexColor,
  getRankIconUrl,
  getRoleColor,
  isDisplayableGameMode,
  openCoachNotes,
  openTimeline,
  seekAnalysisMoment,
  scoreColor,
  scoreGrade,
  scoreGradeBadgeClass,
  scoreLabel,
  selectedAnalysis,
  selectedId,
  timelineLoadingId,
  topAgent,
  topMap,
  winRate,
} = useCoachingHistory()

const showAlternateScoreline = computed(() => {
  const a = selectedAnalysis.value
  const d = expandedDetail.value
  if (!d || d.ally_score == null) return false
  if (a?.rounds_won == null) return true
  return d.ally_score !== a.rounds_won || d.enemy_score !== a.rounds_lost
})

const statStrip = computed(() => {
  const a = selectedAnalysis.value
  if (!a) return []
  const items: Array<{ label: string; value: string; class?: string }> = []

  if (a.won != null) {
    items.push({
      label: 'Result',
      value: a.won ? 'Win' : 'Loss',
      class: a.won ? 'text-emerald-400' : 'text-red-400',
    })
  }

  if (a.rounds_won != null && a.rounds_lost != null) {
    items.push({ label: 'Rounds', value: `${a.rounds_won}–${a.rounds_lost}` })
  } else if (showAlternateScoreline.value && expandedDetail.value) {
    const d = expandedDetail.value
    items.push({ label: 'Score', value: `${d.ally_score}–${d.enemy_score}` })
  }

  if (a.kills != null) {
    items.push({ label: 'K/D/A', value: `${a.kills}/${a.deaths}/${a.assists}`, class: 'font-mono' })
  }

  const acs = displayAcs(a)
  if (acs != null) items.push({ label: 'ACS', value: String(acs) })

  if (a.hs_pct != null) {
    items.push({
      label: 'HS',
      value: `${a.hs_pct}%`,
      class: a.hs_pct >= 25 ? 'text-orange-400' : undefined,
    })
  }

  return items
})
</script>

<template>
      <div
        class="history-detail flex min-h-0 flex-1 flex-col bg-[#0e0e0e]"
        :class="selectedId == null ? 'max-lg:hidden' : ''"
      >
        <div v-if="selectedId" class="lg:hidden flex-shrink-0 px-3 py-2 border-b border-white/[0.08]">
          <button
            type="button"
            class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"
            @click="clearSelection"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            All sessions
          </button>
        </div>

        <div class="flex-1 overflow-y-auto scrollbar-hide">
          <div class="w-full px-5 py-4 pb-24">
          <!-- Overview when nothing selected (desktop) -->
          <div v-if="!selectedAnalysis" class="space-y-4">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.24em] text-red-400/80">Archive overview</p>
              <p class="mt-1 text-sm text-gray-500">Select a session from the list to view coaching detail and open the VOD.</p>
            </div>

            <div v-if="allAnalyses.length" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div class="dash-panel px-2 py-2.5 text-center">
                <div class="text-sm font-black text-white tabular-nums">{{ allAnalyses.length }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Games</div>
              </div>
              <div class="dash-panel px-2 py-2.5 text-center">
                <div class="text-sm font-black tabular-nums" :class="winRate >= 50 ? 'text-green-400' : 'text-red-400'">{{ winRate }}%</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Win rate</div>
              </div>
              <div class="dash-panel px-2 py-2.5 text-center">
                <div class="text-sm font-black tabular-nums" :class="avgScore !== null ? scoreColor(avgScore) : 'text-gray-600'">{{ avgScore != null ? avgScore * 10 : '—' }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Avg score</div>
              </div>
              <div class="dash-panel px-2 py-2.5 text-center">
                <div class="text-sm font-black text-white tabular-nums">{{ avgKD }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Avg K/D</div>
              </div>
            </div>

            <div v-if="topAgent || topMap" class="grid sm:grid-cols-2 gap-2">
              <div v-if="topAgent" class="dash-panel flex items-center gap-3 px-3 py-3">
                <div class="h-12 w-12 rounded-xl overflow-hidden border border-white/10 p-1" :style="{ background: `linear-gradient(145deg, ${getAgentColor(topAgent)}33, #111)` }">
                  <img v-if="getAgentImage(topAgent)" :src="getAgentImage(topAgent)" class="h-full w-full object-contain" alt="" loading="lazy" decoding="async" />
                </div>
                <div>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Most played agent</p>
                  <p class="text-sm font-bold text-white">{{ topAgent }}</p>
                </div>
              </div>
              <div v-if="topMap" class="dash-panel flex items-center gap-3 px-3 py-3">
                <div class="h-14 w-20 flex-shrink-0 rounded-lg overflow-hidden border border-white/10">
                  <img v-if="getMapListViewImage(topMap)" :src="getMapListViewImage(topMap)" class="h-full w-full object-cover" alt="" loading="lazy" decoding="async" />
                </div>
                <div>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Top map</p>
                  <p class="text-sm font-bold text-white">{{ formatMapLabel(topMap) }}</p>
                </div>
              </div>
            </div>

            <div v-if="chartData" class="dash-panel overflow-hidden">
              <div class="flex items-center gap-2 px-4 py-2 border-b border-white/[0.07]">
                <span class="text-[9px] font-black uppercase tracking-[0.18em] text-gray-500">Score trend</span>
                <div class="flex-1" />
                <span class="text-[9px] font-bold" :class="chartData.up ? 'text-green-400' : 'text-red-400'">
                  {{ chartData.up ? '↑' : '↓' }} {{ chartData.last * 10 }}
                </span>
              </div>
              <div class="px-3 py-2">
                <svg width="100%" :height="chartData.H" :viewBox="`0 0 ${chartData.W} ${chartData.H}`" preserveAspectRatio="none" class="block h-24 w-full">
                  <defs>
                    <linearGradient id="hist-area-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" :stop-color="chartData.up ? '#4ade80' : '#f87171'" stop-opacity="0.3"/>
                      <stop offset="100%" :stop-color="chartData.up ? '#4ade80' : '#f87171'" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <line v-for="gl in chartData.gridLines" :key="gl.score" :x1="chartData.pad" :y1="gl.y" :x2="chartData.W - chartData.pad" :y2="gl.y" stroke="rgba(255,255,255,0.05)" stroke-width="0.75"/>
                  <path :d="chartData.areaPath" fill="url(#hist-area-grad)" />
                  <path :d="chartData.linePath" fill="none" :stroke="chartData.up ? '#4ade80' : '#f87171'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <div class="flex justify-between mt-1">
                  <span class="text-[8px] text-gray-700">{{ chartData.firstDate }}</span>
                  <span class="text-[8px] text-gray-700">{{ chartData.lastDate }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Session detail -->
          <div v-else class="space-y-3">
            <div class="history-hero relative overflow-hidden rounded-2xl border border-white/[0.10]">
              <div class="absolute inset-0">
                <img
                  v-if="selectedAnalysis.map && getMapImage(selectedAnalysis.map)"
                  :src="getMapImage(selectedAnalysis.map)"
                  class="h-full w-full object-cover"
                  alt=""
                  decoding="async"
                />
                <div class="absolute inset-0 bg-gradient-to-r from-black/94 via-black/78 to-black/55" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />
              </div>
              <div class="relative flex items-end gap-4 p-5 min-h-[160px] xl:min-h-[172px]">
                <div
                  class="relative h-20 w-20 flex-shrink-0 rounded-xl overflow-hidden border border-white/15 bg-black/50"
                  :style="selectedAnalysis.agent ? { boxShadow: `0 0 24px ${getAgentColor(selectedAnalysis.agent)}28` } : {}"
                >
                  <img
                    v-if="selectedAnalysis.agent && getAgentImage(selectedAnalysis.agent)"
                    :src="getAgentImage(selectedAnalysis.agent)"
                    class="h-full w-full object-contain p-1.5"
                    alt=""
                    decoding="async"
                  />
                </div>

                <div class="min-w-0 flex-1 pb-0.5">
                  <p class="text-[9px] font-black uppercase tracking-[0.22em] text-red-400/90">Session review</p>
                  <h2 class="text-lg font-black text-white truncate leading-tight">{{ selectedAnalysis.agent || 'Unknown agent' }}</h2>
                  <p class="text-[13px] text-gray-300 font-medium truncate">{{ formatMapLabel(selectedAnalysis.map) || 'Unknown map' }}</p>
                  <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      v-if="selectedAnalysis.agent"
                      class="rounded px-1.5 py-px text-[8px] font-bold uppercase"
                      :style="{ color: getRoleColor(getAgentRole(selectedAnalysis.agent)), backgroundColor: getRoleColor(getAgentRole(selectedAnalysis.agent)) + '22' }"
                    >{{ getAgentRole(selectedAnalysis.agent) }}</span>
                    <span class="text-[10px] text-gray-500">{{ formatDate(selectedAnalysis.created_at) }}</span>
                    <span
                      v-if="selectedAnalysis.rank && getRankIconUrl(selectedAnalysis.rank)"
                      class="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5"
                    >
                      <img :src="getRankIconUrl(selectedAnalysis.rank)!" class="h-3.5 w-3.5 object-contain" :alt="selectedAnalysis.rank" />
                      <span class="text-[9px] font-bold" :style="{ color: getRankHexColor(selectedAnalysis.rank) }">{{ selectedAnalysis.rank }}</span>
                    </span>
                    <span
                      v-if="isDisplayableGameMode(selectedAnalysis.game_mode)"
                      class="rounded-full border border-white/10 bg-white/[0.05] px-2 py-px text-[8px] font-semibold text-gray-500"
                    >{{ formatGameMode(selectedAnalysis.game_mode) }}</span>
                  </div>
                </div>

                <div
                  v-if="selectedAnalysis.overall_score != null"
                  class="flex flex-shrink-0 flex-col items-center justify-center rounded-xl border border-white/15 bg-black/50 px-3 py-2 backdrop-blur-sm min-w-[4.5rem]"
                >
                  <span
                    class="text-2xl font-black tabular-nums leading-none"
                    :class="selectedAnalysis.overall_score >= 78 ? 'text-green-400' : selectedAnalysis.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                  >{{ selectedAnalysis.overall_score * 10 }}</span>
                  <span class="mt-1 rounded px-1.5 py-px text-[9px] font-bold text-center leading-tight" :class="scoreGradeBadgeClass(selectedAnalysis.overall_score)">
                    {{ scoreGrade(selectedAnalysis.overall_score) }}
                  </span>
                  <span class="text-[8px] text-gray-500 mt-0.5 text-center leading-tight">{{ scoreLabel(selectedAnalysis.overall_score) }}</span>
                </div>
              </div>
            </div>

            <div v-if="statStrip.length" class="dash-panel flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
              <template v-for="(item, i) in statStrip" :key="item.label">
                <span v-if="i > 0" class="text-gray-700 text-[10px] select-none">·</span>
                <span class="inline-flex items-baseline gap-1 text-[11px]">
                  <span class="text-[9px] font-bold uppercase tracking-wide text-gray-600">{{ item.label }}</span>
                  <span class="font-bold tabular-nums text-gray-200" :class="item.class">{{ item.value }}</span>
                </span>
              </template>
            </div>

            <div v-if="detailLoading" class="flex items-center justify-center gap-2 py-10">
              <svg class="h-5 w-5 animate-spin text-gray-600" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span class="text-sm text-gray-500">Loading coaching detail…</span>
            </div>

            <template v-else>
              <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,36%)] gap-4 items-start">
                <div class="space-y-3 min-w-0">
              <TacticalIntelBrief v-if="expandedBrief" :brief="expandedBrief" />

              <div
                v-else-if="coachReviewSummary?.status === 'completed'"
                class="dash-panel px-4 py-3 space-y-2 border-violet-500/20"
              >
                <p class="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Coach feedback ready</p>
                <p class="text-[11px] text-gray-400 leading-relaxed">
                  Open VOD review for timeline notes
                  <template v-if="coachReviewSummary.annotationCount"> ({{ coachReviewSummary.annotationCount }})</template>.
                </p>
              </div>

              <div
                v-else-if="coachReviewSummary?.status === 'in_progress'"
                class="dash-panel px-4 py-3 border-amber-500/15"
              >
                <p class="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/90">Coach reviewing</p>
                <p class="mt-1 text-[11px] text-gray-400">You'll get a notification when notes are ready.</p>
              </div>

              <div
                v-else-if="expandedDetail?.heatmap_insight"
                class="dash-panel px-4 py-3 border-amber-500/15"
              >
                <p class="text-[9px] font-black uppercase tracking-widest text-amber-300/80 mb-1">Map intel</p>
                <p class="text-[12px] text-gray-300 leading-relaxed">{{ expandedDetail.heatmap_insight }}</p>
              </div>

              <div v-else-if="expandedDetail?.verdict" class="dash-panel px-4 py-3">
                <p class="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-600 mb-1">Coach verdict</p>
                <p class="text-[12px] italic leading-relaxed text-gray-400">{{ expandedDetail.verdict }}</p>
              </div>

              <div v-if="expandedDetail?.priority_improvements?.length && !expandedBrief?.improvements.length" class="dash-panel px-4 py-3 space-y-2">
                <p class="text-[9px] font-black uppercase tracking-widest text-gray-600">Focus areas</p>
                <div v-for="(imp, i) in expandedDetail.priority_improvements.slice(0, 3)" :key="i" class="flex gap-2">
                  <span class="text-[10px] font-bold flex-shrink-0" :class="i === 0 ? 'text-red-400' : 'text-gray-600'">{{ i + 1 }}</span>
                  <p class="text-[12px] text-gray-400 leading-relaxed">{{ imp }}</p>
                </div>
              </div>

              <p v-if="!hasMomentContent && !expandedBrief && !detailLoading" class="text-sm text-gray-600 text-center py-4 lg:hidden">
                No structured coaching notes for this session.
              </p>
                </div>

                <div class="space-y-3 min-w-0">
              <MatchRecapPanel
                v-if="expandedDetail?.match_highlights?.length"
                :priority-improvements="expandedDetail.priority_improvements"
                :top-issue="expandedDetail.top_issue"
                :coaching-tags="expandedDetail.coaching_tags"
                :spatial-summary="expandedDetail.spatial_summary"
                :api-highlights="expandedDetail.match_highlights"
                @seek="seekAnalysisMoment"
              />

              <TimingComparisonPanel
                v-if="expandedDetail?.timing_comparisons?.length"
                :comparisons="expandedDetail.timing_comparisons"
                @seek="seekAnalysisMoment"
              />

              <DuelMomentCards
                v-if="expandedDetail?.duel_moments?.length"
                :moments="expandedDetail.duel_moments"
                @seek="(ms) => seekAnalysisMoment(Math.max(0, ms - 3000))"
              />

              <p v-if="!hasMomentContent && !expandedBrief && !detailLoading" class="text-sm text-gray-600 text-center py-4 hidden lg:block">
                No structured coaching notes for this session.
              </p>
                </div>
              </div>
            </template>
          </div>
          </div>
        </div>

        <div
          v-if="selectedAnalysis"
          class="flex-shrink-0 border-t border-white/[0.08] bg-[#0e0e0e]/95 backdrop-blur-md px-5 py-3"
        >
          <div class="flex gap-2 w-full">
            <button
              type="button"
              class="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-bold text-red-100 transition-colors hover:border-red-500/45 hover:bg-red-500/15 disabled:opacity-50"
              :disabled="timelineLoadingId === selectedAnalysis.id"
              @click="openTimeline(selectedAnalysis.id)"
            >
              {{ timelineLoadingId === selectedAnalysis.id ? 'Opening VOD…' : 'Open VOD review' }}
            </button>
            <button
              v-if="coachReviewSummary?.status === 'completed'"
              type="button"
              class="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm font-semibold text-violet-100 transition-colors hover:border-violet-400/40 hover:bg-violet-500/15 disabled:opacity-50"
              :disabled="timelineLoadingId === selectedAnalysis.id"
              @click="openCoachNotes(selectedAnalysis.id)"
            >
              Coach notes
            </button>
          </div>
        </div>
      </div>
</template>
