<script setup lang="ts">
import { computed } from 'vue'
import {
  duelMomentScrubberBandClass,
  duelMomentScrubberMarkerClass,
  duelMomentScrubberTitle,
  type DuelMomentManifest,
} from '../../lib/duel-moments'

const props = defineProps<{
  moments: DuelMomentManifest[]
  durationSec: number
  activeMomentId?: string | null
}>()

const emit = defineEmits<{
  select: [moment: DuelMomentManifest]
}>()

const bands = computed(() => {
  if (!props.durationSec || props.durationSec <= 0) return []
  return props.moments
    .map((m) => {
      const start = Math.max(0, m.window_start_ms / 1000)
      const end = Math.min(props.durationSec, m.window_end_ms / 1000)
      if (end <= start) return null
      return {
        moment: m,
        left: (start / props.durationSec) * 100,
        width: ((end - start) / props.durationSec) * 100,
        markerLeft: (m.video_offset_ms / 1000 / props.durationSec) * 100,
      }
    })
    .filter(Boolean) as Array<{
      moment: DuelMomentManifest
      left: number
      width: number
      markerLeft: number
    }>
})
</script>

<template>
  <template v-for="band in bands" :key="band.moment.moment_id">
    <button
      type="button"
      class="absolute top-0 h-full rounded-sm border pointer-events-auto z-[5] transition-colors"
      :class="duelMomentScrubberBandClass(band.moment, activeMomentId === band.moment.moment_id)"
      :style="{ left: band.left + '%', width: Math.max(band.width, 0.4) + '%' }"
      :title="duelMomentScrubberTitle(band.moment)"
      @click.stop="emit('select', band.moment)"
    />
    <span
      class="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2 w-2 rounded-full pointer-events-none z-[6]"
      :class="duelMomentScrubberMarkerClass(band.moment)"
      :style="{ left: band.markerLeft + '%' }"
    />
  </template>
</template>
