<script setup lang="ts">
import { useCoachingHistory } from '../../composables/useCoachingHistory'
import TacticalIntelBrief from '../TacticalIntelBrief.vue'

const {
  allAnalyses,
  avgKD,
  avgScore,
  chartData,
  coachReviewSummary,
  detailLoading,
  displayAcs,
  expandedBrief,
  expandedDetail,
  formatDate,
  formatGameMode,
  formatMapLabel,
  getAgentColor,
  getAgentImage,
  getAgentRole,
  getMapImage,
  getRankHexColor,
  getRankIconUrl,
  getRoleColor,
  isDisplayableGameMode,
  openCoachNotes,
  openTimeline,
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
</script>

<template>
<!-- Right: overview or session detail -->
      <div
        class="history-detail flex flex-1 flex-col min-h-0 min-w-0 bg-[#0e0e0e]"
        :class="selectedId == null ? 'hidden lg:flex' : undefined"
      >
        <!-- Mobile back -->
        <div v-if="selectedId" class="lg:hidden flex-shrink-0 px-3 py-2 border-b border-white/[0.08]">
          <button
            type="button"
            class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white"
            @click="selectedId = null"
          >
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            All sessions
          </button>
        </div>

        <div class="flex-1 overflow-y-auto scrollbar-hide p-4">
          <!-- Overview when nothing selected (desktop) -->
          <div v-if="!selectedAnalysis" class="space-y-4 max-w-2xl">
            <div>
              <p class="text-[10px] font-black uppercase tracking-[0.24em] text-red-400/80">Archive overview</p>
              <p class="mt-1 text-sm text-gray-500">Select a session from the list to view coaching detail and open the VOD.</p>
            </div>

            <div v-if="allAnalyses.length" class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div class="rounded-xl border border-white/[0.10] px-2 py-2.5 text-center bg-[#161616]">
                <div class="text-sm font-black text-white tabular-nums">{{ allAnalyses.length }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Games</div>
              </div>
              <div class="rounded-xl border border-white/[0.10] px-2 py-2.5 text-center bg-[#161616]">
                <div class="text-sm font-black tabular-nums" :class="winRate >= 50 ? 'text-green-400' : 'text-red-400'">{{ winRate }}%</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Win rate</div>
              </div>
              <div class="rounded-xl border border-white/[0.10] px-2 py-2.5 text-center bg-[#161616]">
                <div class="text-sm font-black tabular-nums" :class="avgScore !== null ? scoreColor(avgScore) : 'text-gray-600'">{{ avgScore != null ? avgScore * 10 : '—' }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Avg score</div>
              </div>
              <div class="rounded-xl border border-white/[0.10] px-2 py-2.5 text-center bg-[#161616]">
                <div class="text-sm font-black text-white tabular-nums">{{ avgKD }}</div>
                <div class="text-[8px] text-gray-600 mt-0.5 uppercase tracking-wide">Avg K/D</div>
              </div>
            </div>

            <div v-if="topAgent || topMap" class="grid sm:grid-cols-2 gap-2">
              <div v-if="topAgent" class="flex items-center gap-3 rounded-xl border border-white/[0.10] bg-[#161616] px-3 py-3">
                <div class="h-12 w-12 rounded-xl overflow-hidden border border-white/10 p-1" :style="{ background: `linear-gradient(145deg, ${getAgentColor(topAgent)}33, #111)` }">
                  <img v-if="getAgentImage(topAgent)" :src="getAgentImage(topAgent)" class="h-full w-full object-contain" alt="" />
                </div>
                <div>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Most played agent</p>
                  <p class="text-sm font-bold text-white">{{ topAgent }}</p>
                </div>
              </div>
              <div v-if="topMap" class="flex items-center gap-3 rounded-xl border border-white/[0.10] bg-[#161616] px-3 py-3">
                <div class="h-16 w-24 flex-shrink-0 rounded-lg overflow-hidden border border-white/10">
                  <img
                    v-if="getMapImage(topMap)"
                    :src="getMapImage(topMap)"
                    class="h-full w-full object-cover"
                    alt=""
                  />
                </div>
                <div>
                  <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Top map</p>
                  <p class="text-sm font-bold text-white">{{ formatMapLabel(topMap) }}</p>
                </div>
              </div>
            </div>

            <div v-if="chartData" class="rounded-xl border border-white/[0.10] overflow-hidden bg-[#161616]">
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
          <div v-else class="space-y-4">
            <!-- Map + agent hero -->
            <div class="history-hero relative overflow-hidden rounded-2xl border border-white/[0.10]">
              <div class="absolute inset-0">
                <img
                  v-if="selectedAnalysis.map && getMapImage(selectedAnalysis.map)"
                  :src="getMapImage(selectedAnalysis.map)"
                  class="h-full w-full object-cover"
                  alt=""
                />
                <div class="absolute inset-0 bg-gradient-to-r from-black/92 via-black/72 to-black/45" />
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
              </div>
              <div class="relative flex flex-col lg:flex-row gap-4 p-4 min-h-[180px]">
                <div class="flex items-end gap-4 flex-1 min-w-0">
                  <div
                    class="relative h-24 w-24 flex-shrink-0 rounded-2xl overflow-hidden border border-white/15 bg-black/50 shadow-2xl"
                    :style="selectedAnalysis.agent ? { boxShadow: `0 0 32px ${getAgentColor(selectedAnalysis.agent)}33` } : {}"
                  >
                    <img
                      v-if="selectedAnalysis.agent && getAgentImage(selectedAnalysis.agent)"
                      :src="getAgentImage(selectedAnalysis.agent)"
                      class="h-full w-full object-contain p-2"
                      alt=""
                    />
                  </div>
                  <div class="min-w-0 pb-1">
                    <p class="text-[10px] font-black uppercase tracking-[0.22em] text-red-400/90">Session review</p>
                    <h2 class="text-xl font-black text-white truncate">{{ selectedAnalysis.agent || 'Unknown agent' }}</h2>
                    <p class="text-sm text-gray-300 font-medium">{{ formatMapLabel(selectedAnalysis.map) || 'Unknown map' }}</p>
                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        v-if="selectedAnalysis.agent"
                        class="rounded px-1.5 py-px text-[9px] font-bold uppercase"
                        :style="{ color: getRoleColor(getAgentRole(selectedAnalysis.agent)), backgroundColor: getRoleColor(getAgentRole(selectedAnalysis.agent)) + '22' }"
                      >{{ getAgentRole(selectedAnalysis.agent) }}</span>
                      <span
                        v-if="isDisplayableGameMode(selectedAnalysis.game_mode)"
                        class="rounded-full border border-white/10 bg-white/[0.05] px-2 py-px text-[9px] font-semibold text-gray-500"
                      >{{ formatGameMode(selectedAnalysis.game_mode) }}</span>
                      <span class="text-[10px] text-gray-500">{{ formatDate(selectedAnalysis.created_at) }}</span>
                      <span
                        v-if="selectedAnalysis.rank && getRankIconUrl(selectedAnalysis.rank)"
                        class="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-1.5 py-0.5"
                      >
                        <img :src="getRankIconUrl(selectedAnalysis.rank)!" class="h-4 w-4 object-contain" :alt="selectedAnalysis.rank" />
                        <span class="text-[10px] font-bold" :style="{ color: getRankHexColor(selectedAnalysis.rank) }">{{ selectedAnalysis.rank }}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  v-if="selectedAnalysis.map && getMapImage(selectedAnalysis.map)"
                  class="relative h-36 w-full sm:w-56 lg:w-60 flex-shrink-0 rounded-xl overflow-hidden border border-white/15 shadow-xl self-stretch sm:self-center"
                >
                  <img :src="getMapImage(selectedAnalysis.map)" class="h-full w-full object-cover" alt="" />
                  <div class="absolute inset-0 bg-gradient-to-r from-black/25 via-black/10 to-black/50" />
                  <div class="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/15" />
                  <p class="absolute bottom-2 left-2.5 text-[10px] font-bold uppercase tracking-wider text-white/90 drop-shadow-md">
                    {{ formatMapLabel(selectedAnalysis.map) }}
                  </p>
                  <div
                    v-if="selectedAnalysis.overall_score != null"
                    class="absolute inset-y-0 right-0 flex w-[42%] min-w-[5.5rem] flex-col items-center justify-center gap-1 border-l border-white/10 bg-black/45 px-2 py-3 backdrop-blur-md"
                  >
                    <span
                      class="text-3xl font-black tabular-nums leading-none drop-shadow-lg"
                      :class="selectedAnalysis.overall_score >= 78 ? 'text-green-400' : selectedAnalysis.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                    >{{ selectedAnalysis.overall_score * 10 }}</span>
                    <span class="rounded-md px-2 py-0.5 text-[10px] font-bold text-center leading-tight" :class="scoreGradeBadgeClass(selectedAnalysis.overall_score)">
                      {{ scoreGrade(selectedAnalysis.overall_score) }} · {{ scoreLabel(selectedAnalysis.overall_score) }}
                    </span>
                  </div>
                </div>

                <div
                  v-else-if="selectedAnalysis.overall_score != null"
                  class="flex flex-col items-end justify-center flex-shrink-0 rounded-xl border border-white/15 bg-black/40 px-4 py-3 backdrop-blur-sm"
                >
                  <span
                    class="text-4xl font-black tabular-nums leading-none"
                    :class="selectedAnalysis.overall_score >= 78 ? 'text-green-400' : selectedAnalysis.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                  >{{ selectedAnalysis.overall_score * 10 }}</span>
                  <span class="mt-1 rounded-md px-2 py-0.5 text-xs font-bold" :class="scoreGradeBadgeClass(selectedAnalysis.overall_score)">
                    {{ scoreGrade(selectedAnalysis.overall_score) }} · {{ scoreLabel(selectedAnalysis.overall_score) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Match stats -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div v-if="selectedAnalysis.rank && getRankIconUrl(selectedAnalysis.rank)" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Rank</p>
                <div class="mt-1 flex items-center gap-1.5">
                  <img :src="getRankIconUrl(selectedAnalysis.rank)!" class="h-6 w-6 object-contain" :alt="selectedAnalysis.rank" />
                  <p class="text-xs font-bold leading-tight" :style="{ color: getRankHexColor(selectedAnalysis.rank) }">{{ selectedAnalysis.rank }}</p>
                </div>
              </div>
              <div class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Result</p>
                <p class="mt-1 text-sm font-black" :class="selectedAnalysis.won ? 'text-green-400' : selectedAnalysis.won === false ? 'text-red-400' : 'text-gray-500'">
                  {{ selectedAnalysis.won == null ? '—' : selectedAnalysis.won ? 'WIN' : 'LOSS' }}
                </p>
              </div>
              <div v-if="selectedAnalysis.rounds_won != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Rounds</p>
                <p class="mt-1 text-sm font-black tabular-nums text-gray-200">{{ selectedAnalysis.rounds_won }}–{{ selectedAnalysis.rounds_lost }}</p>
              </div>
              <div v-if="selectedAnalysis.kills != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">K/D/A</p>
                <p class="mt-1 text-sm font-black tabular-nums font-mono text-gray-200">
                  {{ selectedAnalysis.kills }}/{{ selectedAnalysis.deaths }}/{{ selectedAnalysis.assists }}
                </p>
              </div>
              <div v-if="displayAcs(selectedAnalysis) != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">ACS</p>
                <p class="mt-1 text-sm font-black tabular-nums text-gray-200">{{ displayAcs(selectedAnalysis) }}</p>
              </div>
              <div v-if="selectedAnalysis.hs_pct != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Headshot</p>
                <p class="mt-1 text-sm font-black tabular-nums" :class="selectedAnalysis.hs_pct >= 25 ? 'text-orange-400' : 'text-gray-300'">{{ selectedAnalysis.hs_pct }}%</p>
              </div>
              <div v-if="expandedDetail?.ally_score != null" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 text-center">
                <p class="text-[8px] font-bold uppercase tracking-wider text-gray-600">Scoreline</p>
                <p class="mt-1 text-sm font-black tabular-nums">
                  <span :class="(expandedDetail.ally_score ?? 0) > (expandedDetail.enemy_score ?? 0) ? 'text-green-400' : 'text-white'">{{ expandedDetail.ally_score }}</span>
                  <span class="text-gray-600">–</span>
                  <span class="text-gray-500">{{ expandedDetail.enemy_score }}</span>
                </p>
              </div>
            </div>

            <div v-if="detailLoading" class="flex items-center justify-center gap-2 py-10">
              <svg class="h-5 w-5 animate-spin text-gray-600" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span class="text-sm text-gray-500">Loading coaching detail…</span>
            </div>

            <template v-else>
              <div
                v-if="coachReviewSummary?.status === 'completed'"
                class="rounded-xl border border-violet-500/25 bg-violet-500/[0.08] px-4 py-3 space-y-2"
              >
                <div class="flex flex-wrap items-center gap-2">
                  <p class="text-[10px] font-black uppercase tracking-[0.18em] text-violet-300">Coach feedback</p>
                  <span
                    v-if="coachReviewSummary.annotationCount"
                    class="text-[10px] text-violet-200/70 tabular-nums"
                  >{{ coachReviewSummary.annotationCount }} timeline notes</span>
                  <span v-if="coachReviewSummary.coachName" class="text-[10px] text-gray-500">
                    from {{ coachReviewSummary.coachName }}
                  </span>
                </div>
                <p class="text-xs text-gray-400 leading-relaxed">
                  Your coach finished this review. Open VOD review to see violet markers on the timeline and jump between notes with
                  <kbd class="rounded border border-violet-500/25 bg-violet-500/10 px-1 text-[10px] text-violet-200/90">C</kbd>,
                  <kbd class="rounded border border-violet-500/25 bg-violet-500/10 px-1 text-[10px] text-violet-200/90">G</kbd>, or
                  <kbd class="rounded border border-violet-500/25 bg-violet-500/10 px-1 text-[10px] text-violet-200/90">1–9</kbd>.
                </p>
                <button
                  type="button"
                  class="w-full rounded-lg border border-violet-500/35 bg-violet-500/15 py-2.5 text-sm font-bold text-violet-100 transition-colors hover:border-violet-400/45 hover:bg-violet-500/20 disabled:opacity-50"
                  :disabled="timelineLoadingId === selectedAnalysis.id"
                  @click="openCoachNotes(selectedAnalysis.id)"
                >
                  {{ timelineLoadingId === selectedAnalysis.id ? 'Opening coach notes…' : 'Open coach notes in VOD →' }}
                </button>
              </div>

              <div
                v-else-if="coachReviewSummary?.status === 'in_progress'"
                class="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3"
              >
                <p class="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/90">Coach reviewing</p>
                <p class="mt-1 text-xs text-gray-400 leading-relaxed">Your coach is annotating this match — you'll get a notification when notes are ready.</p>
              </div>

              <TacticalIntelBrief v-if="expandedBrief" :brief="expandedBrief" />

              <div v-else-if="expandedDetail?.verdict" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                <p class="text-[9px] font-bold uppercase tracking-[0.16em] text-gray-600 mb-1.5">Coach verdict</p>
                <p class="text-sm italic leading-relaxed text-gray-400">{{ expandedDetail.verdict }}</p>
              </div>

              <div v-if="expandedDetail?.priority_improvements?.length && !expandedBrief?.improvements.length" class="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 space-y-2">
                <p class="text-[9px] font-black uppercase tracking-widest text-gray-600">Focus areas</p>
                <div v-for="(imp, i) in expandedDetail.priority_improvements" :key="i" class="flex gap-2">
                  <span class="text-[10px] font-bold flex-shrink-0" :class="i === 0 ? 'text-red-400' : 'text-gray-600'">{{ i + 1 }}</span>
                  <p class="text-sm text-gray-400 leading-relaxed">{{ imp }}</p>
                </div>
              </div>

              <div v-if="expandedDetail?.coaching_tags?.length" class="flex flex-wrap gap-1.5">
                <span
                  v-for="tag in expandedDetail.coaching_tags"
                  :key="tag"
                  class="rounded-full border border-red-500/15 bg-red-500/10 px-2.5 py-0.5 text-[9px] font-semibold capitalize text-red-400/80"
                >{{ tag.replace(/_/g, ' ') }}</span>
              </div>

              <p v-if="!expandedDetail && !expandedBrief && !detailLoading" class="text-sm text-gray-600 text-center py-4">
                No structured coaching notes for this session.
              </p>
            </template>

            <button
              type="button"
              class="w-full rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-bold text-red-100 transition-colors hover:border-red-500/45 hover:bg-red-500/15 disabled:opacity-50"
              :disabled="timelineLoadingId === selectedAnalysis.id"
              @click="openTimeline(selectedAnalysis.id)"
            >
              {{ timelineLoadingId === selectedAnalysis.id ? 'Opening VOD…' : 'Open VOD review →' }}
            </button>
          </div>
        </div>
      </div>
</template>
