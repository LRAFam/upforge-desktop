<script setup lang="ts">
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
