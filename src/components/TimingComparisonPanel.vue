<script setup lang="ts">
import { uiV3 } from '../lib/ui-v3'
export interface TimingComparison {
  id: string
  type: string
  round: number | null
  label: string
  player_label: string
  reference_label: string
  reference_scope: string
  difference_seconds: number
  result: string
  video_offset_ms?: number | null
}

const props = defineProps<{
  comparisons: TimingComparison[]
}>()

const emit = defineEmits<{
  seek: [videoOffsetMs: number]
}>()

function diffClass(sec: number): string {
  if (sec > 5) return 'text-red-300'
  if (sec < -3) return 'text-emerald-300'
  return 'text-gray-300'
}
</script>

<template>
<template v-if="uiV3">
  <section v-if="comparisons.length" class="tc3" aria-label="Timing versus rank average">
    <span class="uf-label">Timing vs rank average</span>
    <button v-for="item in comparisons" :key="item.id" type="button" class="tc3-row" :class="{ 'tc3-row--go': item.video_offset_ms != null }" @click="item.video_offset_ms != null && emit('seek', item.video_offset_ms)">
      <span class="tc3-main">
        <span class="uf-t3">{{ item.label }}<span v-if="item.round != null" class="uf-t4"> · R{{ item.round + 1 }}</span></span>
        <span class="uf-t4">You {{ item.player_label }} · {{ item.reference_scope }} {{ item.reference_label }}</span>
        <span class="uf-t4" style="color: var(--uf-muted)">{{ item.result }}</span>
      </span>
      <span class="uf-d4" :style="{ color: item.difference_seconds > 5 ? 'var(--uf-loss)' : item.difference_seconds < -3 ? 'var(--uf-win)' : 'var(--uf-bone)' }">{{ item.difference_seconds > 0 ? '+' : '' }}{{ item.difference_seconds }}s</span>
    </button>
  </section>
</template>
<template v-else>
  <div v-if="comparisons.length" class="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] overflow-hidden">
    <div class="px-3.5 py-2.5 border-b border-amber-500/15">
      <span class="text-[10px] font-bold uppercase tracking-widest text-amber-300/80">Timing vs rank avg</span>
    </div>
    <div class="p-2.5 space-y-2">
      <button
        v-for="item in comparisons"
        :key="item.id"
        type="button"
        class="w-full text-left rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
        :class="item.video_offset_ms != null ? 'cursor-pointer' : 'cursor-default'"
        @click="item.video_offset_ms != null && emit('seek', item.video_offset_ms)"
      >
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="text-xs font-semibold text-white">
            {{ item.label }}
            <span v-if="item.round != null" class="text-gray-600 font-mono text-[10px] ml-1">R{{ item.round + 1 }}</span>
          </span>
          <span class="text-[10px] font-bold tabular-nums" :class="diffClass(item.difference_seconds)">
            {{ item.difference_seconds > 0 ? '+' : '' }}{{ item.difference_seconds }}s
          </span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-[10px] mb-1">
          <div>
            <span class="text-gray-600 block">You</span>
            <span class="font-mono text-gray-200">{{ item.player_label }}</span>
          </div>
          <div>
            <span class="text-gray-600 block">{{ item.reference_scope }}</span>
            <span class="font-mono text-amber-200/90">{{ item.reference_label }}</span>
          </div>
        </div>
        <p class="text-[10px] text-gray-500 leading-snug">{{ item.result }}</p>
      </button>
    </div>
  </div>
</template>
</template>

<style scoped>
.tc3 { display: flex; flex-direction: column; }
.tc3 > .uf-label { padding-bottom: 10px; }
.tc3-row { display: flex; align-items: center; gap: 16px; width: 100%; text-align: left; padding: 12px 0; background: none; border: 0; border-top: 1px solid var(--uf-line); cursor: default; color: inherit; }
.tc3-row--go { cursor: pointer; }
.tc3-row--go:hover { background: var(--uf-hover); }
.tc3-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
</style>
