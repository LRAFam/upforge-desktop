<script setup lang="ts">
import { computed } from 'vue'

export interface CategoryPercentileEntry {
  score: number
  percentile: number
  peers: number
  label: string
}

const props = defineProps<{
  percentiles: Record<string, CategoryPercentileEntry>
  tier?: string | null
}>()

const ranked = computed(() =>
  Object.entries(props.percentiles)
    .map(([key, entry]) => ({ key, ...entry }))
    .sort((a, b) => a.percentile - b.percentile)
    .slice(0, 4),
)

function percentileTone(p: number): string {
  if (p >= 75) return 'text-emerald-300'
  if (p >= 50) return 'text-blue-300'
  if (p >= 25) return 'text-amber-300'
  return 'text-red-300'
}

function barTone(p: number): string {
  if (p >= 75) return 'bg-emerald-500'
  if (p >= 50) return 'bg-blue-500'
  if (p >= 25) return 'bg-amber-500'
  return 'bg-red-500'
}

function formatLabel(raw: string, fallback?: string): string {
  const text = fallback || raw
  return text.replace(/_/g, ' ')
}
</script>

<template>
  <div
    v-if="ranked.length"
    class="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3 space-y-3"
  >
    <div class="flex items-baseline justify-between gap-2">
      <p class="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">
        vs {{ tier || 'your rank' }}
      </p>
      <p class="text-[10px] text-gray-500">Category percentiles</p>
    </div>
    <div v-for="item in ranked" :key="item.key" class="space-y-1">
      <div class="flex justify-between text-[11px] gap-2">
        <span class="text-gray-300 capitalize truncate">{{ formatLabel(item.key, item.label) }}</span>
        <span class="font-black tabular-nums flex-shrink-0" :class="percentileTone(item.percentile)">
          {{ item.percentile }}th
        </span>
      </div>
      <div class="h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-700"
          :class="barTone(item.percentile)"
          :style="{ width: `${Math.max(4, item.percentile)}%` }"
        />
      </div>
    </div>
  </div>
</template>
