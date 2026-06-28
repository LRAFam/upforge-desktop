<script setup lang="ts">
import { useCoachingHistory } from '../../composables/useCoachingHistory'

const {
  allAnalyses,
  coachReviewByAnalysisId,
  filteredAnalyses,
  formatDate,
  formatMapLabel,
  getAgentColor,
  getAgentImage,
  getMapImage,
  getRankHexColor,
  getRankIconUrl,
  groupedAnalyses,
  loading,
  scoreGrade,
  scoreGradeBadgeClass,
  selectSession,
  selectedId,
} = useCoachingHistory()
</script>

<template>
<div
        class="history-list flex h-full min-h-0 flex-col flex-shrink-0 border-b border-white/[0.08] lg:h-auto lg:w-[min(400px,38%)] lg:border-b-0 lg:border-r xl:w-[min(440px,36%)]"
        :class="selectedId != null ? 'max-lg:hidden' : ''"
      >
        <div class="flex-1 overflow-y-auto px-3 py-3 scrollbar-hide">
          <div v-if="loading" class="space-y-2">
            <div v-for="i in 6" :key="i" class="h-16 rounded-xl bg-white/[0.02] animate-pulse border border-white/[0.07]" />
          </div>

          <div v-else-if="filteredAnalyses.length === 0" class="flex items-center justify-center py-12 px-2">
            <div class="text-center">
              <p class="text-sm font-semibold text-gray-300">{{ allAnalyses.length === 0 ? 'No sessions yet' : 'No matches for this filter' }}</p>
              <p class="mt-1 text-xs text-gray-600">Record or upload a match to build your archive.</p>
            </div>
          </div>

          <div v-else class="space-y-4">
            <section v-for="group in groupedAnalyses" :key="group.label" class="space-y-1.5">
              <div class="flex items-center gap-2 px-1 py-0.5">
                <span class="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-600">{{ group.label }}</span>
                <span class="text-[9px] text-gray-700">{{ group.items.length }}</span>
                <div class="flex-1 h-px bg-white/[0.05]" />
              </div>

              <button
                v-for="a in group.items"
                :key="a.id"
                type="button"
                class="history-list-row w-full text-left rounded-xl border px-2.5 py-2 transition-all"
                :class="[
                  selectedId === a.id
                    ? 'border-red-500/35 bg-red-500/[0.08] shadow-[0_0_0_1px_rgba(239,68,68,0.12)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]',
                  a.won === true ? 'history-list-row--won' : a.won === false ? 'history-list-row--lost' : '',
                ]"
                @click="selectSession(a)"
              >
                <div class="flex items-center gap-2.5">
                  <div
                    class="history-list-thumb relative h-12 w-[54px] flex-shrink-0 rounded-lg overflow-hidden border border-white/10 bg-black/50"
                    :style="a.agent ? { boxShadow: `inset 0 0 0 1px ${getAgentColor(a.agent)}33` } : {}"
                  >
                    <img
                      v-if="a.map && getMapImage(a.map)"
                      :src="getMapImage(a.map)"
                      class="absolute inset-0 h-full w-full object-cover opacity-55"
                      alt=""
                    />
                    <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
                    <img
                      v-if="a.agent && getAgentImage(a.agent)"
                      :src="getAgentImage(a.agent)"
                      class="relative mx-auto mt-1 h-8 w-8 object-contain drop-shadow-md"
                      alt=""
                    />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1 min-w-0">
                      <span class="text-xs font-bold text-white truncate">{{ a.agent || 'Unknown' }}</span>
                      <span class="text-gray-700">·</span>
                      <span class="text-xs text-gray-400 truncate">{{ formatMapLabel(a.map) || '—' }}</span>
                    </div>
                    <div class="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-gray-600">
                      <span>{{ formatDate(a.created_at) }}</span>
                      <span
                        v-if="a.rank && getRankIconUrl(a.rank)"
                        class="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1 py-px"
                        :title="a.rank"
                      >
                        <img :src="getRankIconUrl(a.rank)!" class="h-3.5 w-3.5 object-contain" :alt="a.rank" />
                        <span class="text-[9px] font-semibold" :style="{ color: getRankHexColor(a.rank) }">{{ a.rank }}</span>
                      </span>
                      <span
                        v-if="a.won != null"
                        class="font-bold"
                        :class="a.won ? 'text-green-500/80' : 'text-red-500/70'"
                      >{{ a.won ? 'W' : 'L' }}</span>
                      <span v-if="a.rounds_won != null && a.rounds_lost != null" class="tabular-nums">{{ a.rounds_won }}–{{ a.rounds_lost }}</span>
                      <span v-if="a.kills != null" class="tabular-nums font-mono text-gray-500">{{ a.kills }}/{{ a.deaths }}/{{ a.assists }}</span>
                    </div>
                  </div>

                  <div class="flex flex-shrink-0 flex-col items-end gap-0.5">
                    <span
                      v-if="coachReviewByAnalysisId[a.id]?.status === 'completed'"
                      class="inline-flex items-center gap-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-1.5 py-px text-[8px] font-semibold text-violet-300/90"
                      title="Coach feedback ready"
                    >
                      <span class="h-1 w-1 rounded-full bg-violet-400" />
                      Coach
                    </span>
                    <span
                      v-else-if="coachReviewByAnalysisId[a.id]?.status === 'in_progress'"
                      class="text-[8px] font-medium text-amber-400/80"
                    >Reviewing</span>
                    <span
                      v-if="a.overall_score != null"
                      class="text-sm font-black tabular-nums leading-none"
                      :class="a.overall_score >= 78 ? 'text-green-400' : a.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                    >{{ a.overall_score * 10 }}</span>
                    <span
                      v-else-if="['queued', 'processing', 'pending'].includes(a.status)"
                      class="text-[9px] text-gray-600"
                    >…</span>
                    <span
                      v-if="a.overall_score != null"
                      class="rounded px-1 py-px text-[8px] font-bold"
                      :class="scoreGradeBadgeClass(a.overall_score)"
                    >{{ scoreGrade(a.overall_score) }}</span>
                  </div>
                </div>
              </button>
            </section>
          </div>
        </div>
      </div>
</template>
