<script setup lang="ts">
import LibraryPageHeader from '../shared/LibraryPageHeader.vue'
import { openGameHistoryWeb } from '../../lib/game-modules'
import { useCoachingHistory } from '../../composables/useCoachingHistory'

defineProps<{ embedded?: boolean }>()

const {
  RESULT_FILTERS,
  activeFilter,
  activeMap,
  allAnalyses,
  availableMaps,
  features,
  filteredAnalyses,
  formatMapLabel,
  getMapListViewImage,
  pendingRecordings,
  primaryGame,
  theme,
} = useCoachingHistory()
</script>

<template>
    <div class="flex-shrink-0 border-b border-white/[0.08] bg-[#111111]">
      <LibraryPageHeader v-if="!embedded" title="Matches" description="Pick a match, revisit a moment, and build your next-match focus.">
        <span>{{ pendingRecordings.length }} awaiting coaching · {{ allAnalyses.length }} reviewed</span>
      </LibraryPageHeader>
      <div v-if="primaryGame === 'lol'" class="flex items-center justify-between gap-3 px-4 py-2 text-xs text-gray-400">
        <span>Desktop recordings and coaching</span>
        <button class="text-amber-400 hover:text-amber-300" @click="openGameHistoryWeb('lol')">Riot match reports on the website</button>
      </div>
      <div class="flex flex-wrap items-center gap-2 px-4 py-2">
        <span class="text-[9px] font-bold uppercase tracking-[0.14em] text-gray-600">Coached filters</span>
        <div class="flex gap-1 flex-wrap flex-1 min-w-0">
          <button
            v-for="f in RESULT_FILTERS"
            :key="f"
            class="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border"
            :class="activeFilter === f
              ? theme.historyFilterActiveClass
              : 'text-gray-500 border-white/[0.08] hover:text-gray-300 hover:bg-white/[0.03]'"
            :aria-pressed="activeFilter === f"
            @click="activeFilter = f"
          >{{ f }}</button>
        </div>
        <p class="text-[10px] text-gray-600 tabular-nums flex-shrink-0">
          <span class="font-bold text-gray-400">{{ filteredAnalyses.length }}</span><span class="text-gray-700">/{{ allAnalyses.length }}</span>
        </p>
      </div>
      <details v-if="features.mapFilters && availableMaps.length > 1" class="map-filters">
        <summary>Map <span>{{ activeMap ? formatMapLabel(activeMap) : 'All maps' }}</span></summary>
        <div class="history-map-grid px-4 pb-3 pt-2">
        <button
          class="history-map-pill history-map-pill--all"
          :class="{ 'history-map-pill--active': activeMap === null }"
          :aria-pressed="activeMap === null"
          @click="activeMap = null"
        >
          <div class="history-map-pill__shade history-map-pill__shade--all" />
          <span class="history-map-pill__label">All</span>
        </button>
        <button
          v-for="map in availableMaps"
          :key="map"
          class="history-map-pill"
          :class="{ 'history-map-pill--active': activeMap === map }"
          :aria-pressed="activeMap === map"
          @click="activeMap = map"
        >
          <img
            v-if="getMapListViewImage(map)"
            :src="getMapListViewImage(map)"
            class="history-map-pill__bg object-cover"
            alt=""
            loading="lazy"
            decoding="async"
            fetchpriority="low"
          />
          <div class="history-map-pill__shade" />
          <span class="history-map-pill__label">{{ formatMapLabel(map) }}</span>
        </button>
        </div>
      </details>
    </div>
</template>

<style scoped>
.map-filters{border-top:1px solid #ffffff0c}summary{cursor:pointer;min-height:40px;padding:10px 16px;color:#9ca3af;font-size:12px}summary span{margin-left:12px;color:#e5e7eb;font-weight:600}button:focus-visible,summary:focus-visible{outline:2px solid #f43f5e;outline-offset:-2px}
</style>
