<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SquadCompareRow } from '../../lib/squad-ui'
import { formatDecimalStat, squadMemberColor, squadMemberInitials } from '../../lib/squad-ui'

const props = defineProps<{
  rows: SquadCompareRow[]
  memberIndex: (userId: number) => number
}>()

type Metric = 'winRate' | 'analyses' | 'kd'

const metric = ref<Metric>('winRate')

const visibleRows = computed(() => props.rows.filter(r => {
  if (metric.value === 'winRate') return r.winRate != null
  if (metric.value === 'kd') return r.kdRatio != null
  return r.analysesCount > 0
}).slice(0, 6))

const maxValue = computed(() => {
  if (!visibleRows.value.length) return 1
  if (metric.value === 'winRate') return 100
  if (metric.value === 'kd') return Math.max(...visibleRows.value.map(r => r.kdRatio ?? 0), 1)
  return Math.max(...visibleRows.value.map(r => r.analysesCount), 1)
})

function barValue(row: SquadCompareRow): number {
  if (metric.value === 'winRate') return row.winRate ?? 0
  if (metric.value === 'kd') return row.kdRatio ?? 0
  return row.analysesCount
}

function barLabel(row: SquadCompareRow): string {
  if (metric.value === 'winRate') return row.winRate != null ? `${Math.round(row.winRate)}%` : '—'
  if (metric.value === 'kd') return formatDecimalStat(row.kdRatio)
  return String(row.analysesCount)
}

function barWidth(row: SquadCompareRow): string {
  const v = barValue(row)
  return `${Math.max(8, Math.round((v / maxValue.value) * 100))}%`
}
</script>

<template>
  <div v-if="rows.length" class="dash-panel p-4">
    <div class="flex items-center justify-between gap-2 mb-3">
      <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Member compare</p>
      <div class="flex rounded-lg border border-white/[0.08] overflow-hidden">
        <button
          v-for="m in ([['winRate', 'Win %'], ['analyses', 'VODs'], ['kd', 'K/D']] as const)"
          :key="m[0]"
          type="button"
          class="px-2.5 py-1 text-[10px] font-bold transition-colors"
          :class="metric === m[0] ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'"
          @click="metric = m[0]"
        >{{ m[1] }}</button>
      </div>
    </div>

    <div v-if="visibleRows.length" class="space-y-2.5">
      <div v-for="row in visibleRows" :key="row.userId" class="flex items-center gap-2">
        <span
          class="flex h-7 w-7 items-center justify-center rounded-lg text-[9px] font-black flex-shrink-0 border border-white/[0.06]"
          :style="{
            background: `${squadMemberColor(memberIndex(row.userId))}22`,
            color: squadMemberColor(memberIndex(row.userId)),
          }"
        >{{ squadMemberInitials(row.name) }}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <p class="text-[11px] font-semibold text-white truncate">{{ row.name }}</p>
            <p class="text-[11px] font-black tabular-nums text-gray-300 flex-shrink-0">{{ barLabel(row) }}</p>
          </div>
          <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :style="{
                width: barWidth(row),
                background: squadMemberColor(memberIndex(row.userId)),
              }"
            />
          </div>
        </div>
      </div>
    </div>
    <p v-else class="text-[11px] text-gray-600 py-4 text-center">No data for this metric yet.</p>
  </div>
</template>
