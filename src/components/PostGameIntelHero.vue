<script setup lang="ts">
import { computed, ref } from 'vue'
import MatchSpatialMinimap from './MatchSpatialMinimap.vue'
import type { MatchSpatialSummary } from '../lib/spatial-types'

export interface CategoryScoreItem {
  category: string
  score: number
  reasoning?: string
}

const props = defineProps<{
  summary: MatchSpatialSummary | null | undefined
  mapName?: string | null
  game?: string | null
  agentAccent?: string | null
  overallScore?: number | null
  matchResult?: 'win' | 'loss' | null
  kills?: number | null
  deaths?: number | null
  primaryInsight?: string | null
  categoryScores?: CategoryScoreItem[]
  activeSpatialIndex?: number | null
}>()

const emit = defineEmits<{
  'update:activeSpatialIndex': [index: number | null]
  copyMap: []
  selectDeath: [index: number]
}>()

const minimapRef = ref<InstanceType<typeof MatchSpatialMinimap> | null>(null)

defineExpose({
  exportPng: () => minimapRef.value?.exportPng() ?? null,
})

const deathEvents = computed(() =>
  (props.summary?.events ?? [])
    .map((ev, index) => ({ ev, index }))
    .filter((x) => x.ev.type === 'death'),
)

const plantEvents = computed(() =>
  (props.summary?.events ?? [])
    .map((ev, index) => ({ ev, index }))
    .filter((x) => x.ev.type === 'plant'),
)

const plantBenchmarks = computed(() => props.summary?.plantBenchmarks ?? [])
const peekBenchmarks = computed(() => props.summary?.peekBenchmarks ?? [])

const isolatedCount = computed(() =>
  deathEvents.value.filter((d) => d.ev.isolated).length,
)

const topHotspot = computed(() => props.summary?.deathHotspots?.[0]?.callout ?? null)

/** Round-aware headline, e.g. "You died @ B Main 4× in 13 rounds". */
const heatmapInsight = computed(
  () => props.summary?.heatmapInsight ?? props.summary?.patterns?.[0] ?? null,
)

const showHeatmap = computed(() => {
  const events = props.summary?.events ?? []
  const deaths = events.filter((e) => e.type === 'death').length
  const plants = events.filter((e) => e.type === 'plant').length
  return deaths >= 2 || plants >= 1
})

const worstCategories = computed(() => {
  const list = [...(props.categoryScores ?? [])]
    .filter((c) => typeof c.score === 'number')
    .sort((a, b) => a.score - b.score)
  return list.slice(0, 3)
})

function categoryLabel(raw: string): string {
  return raw.replace(/_/g, ' ')
}

function barColor(score: number): string {
  if (score <= 3) return 'bg-red-500'
  if (score <= 5) return 'bg-amber-500'
  return 'bg-emerald-500'
}

function onSelect(index: number) {
  emit('update:activeSpatialIndex', index)
  emit('selectDeath', index)
}
</script>

<template>
  <div class="space-y-3 intel-hero-in">
    <!-- Map-first hero -->
    <div
      v-if="summary?.events?.length"
      class="relative overflow-hidden rounded-2xl"
      :style="agentAccent
        ? { boxShadow: `0 0 40px ${agentAccent}25`, border: `1px solid ${agentAccent}50` }
        : { border: '1px solid rgba(255,255,255,0.12)' }"
    >
      <div
        class="absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 pointer-events-none"
        style="background: linear-gradient(to bottom, rgba(0,0,0,0.85), transparent);"
      >
        <div class="max-w-[70%]">
          <p class="text-[10px] font-black uppercase tracking-[0.28em] text-red-400">Match Intel</p>
          <p
            v-if="heatmapInsight"
            class="text-xs font-bold text-white leading-snug mt-1 drop-shadow-md"
          >{{ heatmapInsight }}</p>
          <p v-else-if="game === 'cs2'" class="text-[10px] text-gray-500 mt-0.5">Demo-verified positions · radar heatmap</p>
          <p v-else class="text-[10px] text-gray-500 mt-0.5">Riot-verified positions · not guesswork</p>
        </div>
        <div v-if="overallScore != null" class="text-right">
          <p class="text-2xl font-black tabular-nums text-white leading-none">{{ overallScore * 10 }}</p>
          <p class="text-[9px] text-gray-500 font-semibold">/ 1000</p>
        </div>
      </div>

      <MatchSpatialMinimap
        ref="minimapRef"
        :summary="summary"
        :map-name="mapName"
        :game="game"
        :active-index="activeSpatialIndex ?? null"
        :large="true"
        :show-legend="false"
        :show-heatmap="showHeatmap"
        @select="(_ev, idx) => onSelect(idx)"
      />

      <!-- Floating stats strip -->
      <div
        class="absolute inset-x-0 bottom-0 z-10 p-3 pt-8"
        style="background: linear-gradient(to top, rgba(0,0,0,0.92) 55%, transparent);"
      >
        <div class="flex flex-wrap gap-1.5 mb-2">
          <span
            v-if="matchResult"
            class="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
            :class="matchResult === 'win' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'"
          >{{ matchResult }}</span>
          <span v-if="deaths != null" class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/25">
            {{ deaths }} deaths
          </span>
          <span v-if="isolatedCount" class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/25">
            {{ isolatedCount }} no trade
          </span>
          <span v-if="topHotspot" class="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-gray-300 border border-white/15">
            Hotspot: {{ topHotspot }}
          </span>
        </div>

        <div class="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
          <button
            v-for="item in deathEvents"
            :key="`d-${item.index}`"
            type="button"
            class="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all"
            :class="activeSpatialIndex === item.index
              ? 'bg-red-500/25 border-red-400/50 text-white'
              : 'bg-black/40 border-white/10 text-gray-400 hover:border-red-500/30'"
            :title="item.ev.benchmarkHint ?? undefined"
            @click="onSelect(item.index)"
          >
            R{{ item.ev.round + 1 }} · {{ item.ev.callout }}
          </button>
          <button
            v-for="item in plantEvents"
            :key="`p-${item.index}`"
            type="button"
            class="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border transition-all"
            :class="activeSpatialIndex === item.index
              ? 'bg-orange-500/25 border-orange-400/50 text-white'
              : 'bg-black/40 border-white/10 text-gray-400 hover:border-orange-500/30'"
            :title="item.ev.benchmarkHint ?? undefined"
            @click="onSelect(item.index)"
          >
            R{{ item.ev.round + 1 }} · {{ item.ev.callout }}
          </button>
        </div>

        <div v-if="peekBenchmarks.length" class="mt-2 space-y-1 pointer-events-auto">
          <p
            v-for="(line, i) in peekBenchmarks"
            :key="`peek-${i}`"
            class="text-[10px] text-blue-200/90 leading-snug"
          >{{ line }}</p>
        </div>

        <div v-if="plantBenchmarks.length" class="mt-2 space-y-1 pointer-events-auto">
          <p
            v-for="(line, i) in plantBenchmarks"
            :key="i"
            class="text-[10px] text-orange-200/90 leading-snug"
          >{{ line }}</p>
        </div>

        <button
          type="button"
          class="mt-2 w-full text-[10px] font-bold uppercase tracking-wider text-gray-400 hover:text-white py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-colors pointer-events-auto"
          @click="emit('copyMap')"
        >
          Copy map for social
        </button>
      </div>
    </div>

    <!-- One-line fix (no paragraph wall) -->
    <div
      v-if="primaryInsight"
      class="rounded-xl border border-red-500/25 bg-gradient-to-r from-red-500/10 to-transparent px-4 py-3"
    >
      <p class="text-[10px] font-black uppercase tracking-[0.2em] text-red-400 mb-1">Fix this first</p>
      <p class="text-sm font-bold text-white leading-snug">{{ primaryInsight }}</p>
    </div>

    <!-- Top 3 weakest skills — glanceable bars only -->
    <div v-if="worstCategories.length" class="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 space-y-2.5">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Weakest areas</p>
      <div v-for="cat in worstCategories" :key="cat.category" class="space-y-1">
        <div class="flex justify-between text-[11px]">
          <span class="text-gray-400 capitalize">{{ categoryLabel(cat.category) }}</span>
          <span class="font-black tabular-nums" :class="cat.score <= 4 ? 'text-red-400' : 'text-amber-300'">{{ cat.score }}/10</span>
        </div>
        <div class="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div class="h-full rounded-full transition-all duration-700" :class="barColor(cat.score)" :style="{ width: `${cat.score * 10}%` }" />
        </div>
      </div>
    </div>

    <slot />
  </div>
</template>

<style scoped>
.intel-hero-in {
  animation: intel-in 0.45s ease-out both;
}
@keyframes intel-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.scrollbar-thin::-webkit-scrollbar {
  height: 4px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
}
</style>
