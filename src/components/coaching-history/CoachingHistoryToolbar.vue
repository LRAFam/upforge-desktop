<script setup lang="ts">
import { useCoachingHistory } from '../../composables/useCoachingHistory'

const {
  RESULT_FILTERS,
  activeFilter,
  activeMap,
  allAnalyses,
  availableMaps,
  features,
  filteredAnalyses,
  formatMapLabel,
  getMapImage,
  theme,
} = useCoachingHistory()
</script>

<template>
    <div class="flex-shrink-0 px-4 py-2.5 border-b border-white/[0.08] space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-1.5 flex-wrap flex-1 min-w-0">
          <button
            v-for="f in RESULT_FILTERS"
            :key="f"
            class="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border"
            :class="activeFilter === f
              ? theme.historyFilterActiveClass
              : 'text-gray-500 border-white/[0.10] hover:text-gray-300 hover:bg-white/[0.03] hover:border-white/[0.12]'"
            @click="activeFilter = f"
          >{{ f }}</button>
        </div>
        <p class="text-[10px] text-gray-600 tabular-nums flex-shrink-0">
          <span class="font-bold text-gray-400">{{ filteredAnalyses.length }}</span>
          <span class="text-gray-700"> / {{ allAnalyses.length }}</span>
          <span class="ml-1 uppercase tracking-wide">sessions</span>
        </p>
      </div>
      <div v-if="features.mapFilters && availableMaps.length > 1" class="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5 -mx-1 px-1">
        <button
          class="history-map-pill history-map-pill--all flex-shrink-0"
          :class="{ 'history-map-pill--active': activeMap === null }"
          @click="activeMap = null"
        >
          <div class="history-map-pill__shade history-map-pill__shade--all" />
          <span class="history-map-pill__label">All maps</span>
        </button>
        <button
          v-for="map in availableMaps"
          :key="map"
          class="history-map-pill flex-shrink-0"
          :class="{ 'history-map-pill--active': activeMap === map }"
          @click="activeMap = map"
        >
          <img
            v-if="getMapImage(map)"
            :src="getMapImage(map)"
            class="history-map-pill__bg object-cover"
            alt=""
          />
          <div class="history-map-pill__shade" />
          <span class="history-map-pill__label">{{ formatMapLabel(map) }}</span>
        </button>
      </div>
    </div>
</template>
