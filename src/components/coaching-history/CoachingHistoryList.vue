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
  getMapListViewImage,
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
        class="history-list flex h-full min-h-0 flex-col flex-shrink-0 border-b border-white/[0.08] lg:h-auto lg:w-[min(320px,30%)] lg:border-b-0 lg:border-r xl:w-[min(340px,28%)]"
        :class="selectedId != null ? 'max-lg:hidden' : ''"
      >
        <div class="flex-1 overflow-y-auto px-2.5 py-2.5 scrollbar-hide">
          <div v-if="loading" class="space-y-2">
            <div v-for="i in 6" :key="i" class="h-14 rounded-xl bg-white/[0.02] animate-pulse border border-white/[0.07]" />
          </div>

          <div v-else-if="filteredAnalyses.length === 0" class="flex items-center justify-center py-12 px-2">
            <div class="text-center">
              <p class="text-sm font-semibold text-gray-300">{{ allAnalyses.length === 0 ? 'No sessions yet' : 'No matches for this filter' }}</p>
              <p class="mt-1 text-xs text-gray-600">Record or upload a match to build your archive.</p>
            </div>
          </div>

          <div v-else class="space-y-3">
            <section v-for="group in groupedAnalyses" :key="group.label" class="space-y-1">
              <div class="flex items-center gap-2 px-1 py-0.5">
                <span class="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-600">{{ group.label }}</span>
                <span class="text-[9px] text-gray-700 tabular-nums">{{ group.items.length }}</span>
              </div>

              <button
                v-for="a in group.items"
                :key="a.id"
                type="button"
                class="history-list-row w-full text-left rounded-xl border px-2 py-2 transition-all"
                :class="[
                  selectedId === a.id
                    ? 'border-red-500/35 bg-red-500/[0.08] shadow-[0_0_0_1px_rgba(239,68,68,0.12)]'
                    : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]',
                  a.won === true ? 'history-list-row--won' : a.won === false ? 'history-list-row--lost' : '',
                ]"
                @click="selectSession(a)"
              >
                <div class="flex items-center gap-2">
                  <div
                    class="history-list-thumb relative h-11 w-11 flex-shrink-0 rounded-lg overflow-hidden border border-white/10 bg-black/50"
                    :style="a.agent ? { boxShadow: `inset 0 0 0 1px ${getAgentColor(a.agent)}33` } : {}"
                  >
                    <img
                      v-if="a.agent && getAgentImage(a.agent)"
                      :src="getAgentImage(a.agent)"
                      class="relative h-full w-full object-contain p-1 drop-shadow-md"
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <img
                      v-else-if="a.map && getMapListViewImage(a.map)"
                      :src="getMapListViewImage(a.map)"
                      class="absolute inset-0 h-full w-full object-cover opacity-60"
                      alt=""
                      loading="lazy"
                      decoding="async"
                      fetchpriority="low"
                    />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1 min-w-0">
                      <span class="text-[12px] font-bold text-white truncate">{{ a.agent || 'Unknown' }}</span>
                      <span class="text-gray-700 flex-shrink-0">·</span>
                      <span class="text-[11px] text-gray-400 truncate">{{ formatMapLabel(a.map) || '—' }}</span>
                    </div>
                    <div class="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-600 min-w-0">
                      <span class="flex-shrink-0">{{ formatDate(a.created_at) }}</span>
                      <span
                        v-if="a.won != null"
                        class="font-bold flex-shrink-0"
                        :class="a.won ? 'text-green-500/80' : 'text-red-500/70'"
                      >{{ a.won ? 'W' : 'L' }}</span>
                      <span v-if="a.rounds_won != null && a.rounds_lost != null" class="tabular-nums flex-shrink-0">{{ a.rounds_won }}–{{ a.rounds_lost }}</span>
                      <img
                        v-if="a.rank && getRankIconUrl(a.rank)"
                        :src="getRankIconUrl(a.rank)!"
                        class="h-3.5 w-3.5 object-contain flex-shrink-0 opacity-80"
                        :title="a.rank"
                        :alt="a.rank"
                        loading="lazy"
                        decoding="async"
                      />
                      <span
                        v-if="coachReviewByAnalysisId[a.id]?.status === 'completed'"
                        class="inline-flex h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0"
                        title="Coach notes"
                      />
                    </div>
                  </div>

                  <div class="flex flex-shrink-0 flex-col items-end justify-center gap-0.5 pl-1">
                    <span
                      v-if="a.overall_score != null"
                      class="text-[13px] font-black tabular-nums leading-none"
                      :class="a.overall_score >= 78 ? 'text-green-400' : a.overall_score >= 50 ? 'text-yellow-400' : 'text-red-400'"
                    >{{ a.overall_score * 10 }}</span>
                    <span
                      v-else-if="['queued', 'processing', 'pending'].includes(a.status)"
                      class="text-[9px] text-gray-600"
                    >…</span>
                    <span
                      v-if="a.overall_score != null"
                      class="rounded px-1 py-px text-[8px] font-bold leading-none"
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
