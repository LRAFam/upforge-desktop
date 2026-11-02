<script setup lang="ts">
/**
 * v3 filters for Coaching reviews: result + map as secondary text tabs on one line, with a real count.
 * The practice range is not a match map, so it is left out of the map filter (its reviews stay under All maps).
 */
import { computed } from 'vue'
import { useCoachingHistory } from '../../../composables/useCoachingHistory'
import { openGameHistoryWeb } from '../../../lib/game-modules'
import UfTabs from '../UfTabs.vue'

const {
  RESULT_FILTERS,
  activeFilter,
  activeMap,
  allAnalyses,
  availableMaps,
  features,
  filteredAnalyses,
  formatMapLabel,
  pendingRecordings,
  primaryGame,
} = useCoachingHistory()

const resultItems = computed(() => RESULT_FILTERS.map(f => ({ key: f, label: f })))
const matchMaps = computed(() => availableMaps.value.filter(m => !/range/i.test(m) && formatMapLabel(m) !== 'The Range'))
const mapItems = computed(() => [{ key: '__all', label: 'All maps' }, ...matchMaps.value.map(m => ({ key: m, label: formatMapLabel(m) }))])
const showMaps = computed(() => features.value.mapFilters && matchMaps.value.length > 1)

function setResult(key: string) {
  const match = RESULT_FILTERS.find(f => f === key)
  if (match) activeFilter.value = match
}
</script>

<template>
  <div class="rv3-filters">
    <div class="rv3-filter-row">
      <UfTabs :items="resultItems" :model-value="activeFilter" size="filter" label="Result" @update:model-value="setResult" />
      <span style="flex: 1" />
      <span class="uf-t4">{{ pendingRecordings.length }} before coaching · {{ filteredAnalyses.length }} of {{ allAnalyses.length }} reviewed</span>
    </div>
    <div v-if="showMaps" class="rv3-maps">
      <UfTabs :items="mapItems" :model-value="activeMap ?? '__all'" size="filter" label="Map" @update:model-value="activeMap = $event === '__all' ? null : $event" />
    </div>
    <p v-if="primaryGame === 'lol'" class="uf-t4" style="margin: 0">
      Desktop recordings and coaching. <button type="button" class="uf-link" @click="openGameHistoryWeb('lol')">Riot match reports on the website</button>
    </p>
  </div>
</template>

<style scoped>
.rv3-filters { flex: none; display: flex; flex-direction: column; gap: 10px; padding: 14px 40px 10px; border-bottom: 1px solid var(--uf-line); }
.rv3-filter-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
/* One line of maps: scrolls sideways instead of wrapping one map onto a second line. */
.rv3-maps { overflow-x: auto; scrollbar-width: none; }
.rv3-maps::-webkit-scrollbar { display: none; }
.rv3-maps :deep(.uf-tabs) { flex-wrap: nowrap; white-space: nowrap; }
/* Filters are secondary to the view tabs above: the active one is bone with a thin bone line (no red). */
</style>
