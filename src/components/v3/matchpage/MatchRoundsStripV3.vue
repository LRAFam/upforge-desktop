<script setup lang="ts">
/** Match page rounds strip (won / lost / died first per round). Click a round to jump the video to it. */
import { computed } from 'vue'
import { useVodReview } from '../../../composables/useVodReview'
import UfRoundsLine from '../UfRoundsLine.vue'
import { roundsForLine } from './match-page-v3'

const { activeRoundNumber, allTimelineEvents, currentTime, isRoundBased, roundGroups, seekToRound } = useVodReview()

const roundBars = computed(() => (isRoundBased.value ? roundsForLine(roundGroups.value, allTimelineEvents.value) : []))
// No highlight at 0:00 before anything played: R1 isn't "selected" just because the video starts there.
const selectedRound = computed(() => {
  if (activeRoundNumber.value == null || currentTime.value <= 0) return null
  const i = roundGroups.value.findIndex(r => r.roundNumber === activeRoundNumber.value)
  return i >= 0 ? i + 1 : null
})
function onRoundSelect(n: number) {
  const g = roundGroups.value[n - 1]
  if (g) seekToRound(g)
}
const markedCount = computed(() => roundBars.value.filter(r => r.marked).length)
</script>

<template>
  <div v-if="roundBars.length" class="uf-mp-rounds">
    <div class="uf-mp-rounds-head">
      <span class="uf-label">Rounds</span>
      <span class="uf-mp-legend">
        <span><i class="uf-mp-key uf-mp-key--win" />Won</span>
        <span><i class="uf-mp-key" />Lost</span>
        <span v-if="markedCount > 0"><i class="uf-mp-key uf-mp-key--mark" />You died first</span>
      </span>
    </div>
    <UfRoundsLine :rounds="roundBars" :selected="selectedRound" :height="22" @select="onRoundSelect" />
  </div>
</template>

<style scoped>
/* Lost rounds read as muted loss red, not an empty track; the current round is marked by its number. */
.uf-mp-rounds { display: flex; flex-direction: column; gap: 8px; max-width: 760px; padding: 12px 0; }
.uf-mp-rounds-head { display: flex; justify-content: space-between; align-items: center; }
.uf-mp-legend { display: flex; gap: 16px; font: 400 13px/1.4 var(--uf-body); color: var(--uf-faint); }
.uf-mp-legend span { display: inline-flex; align-items: center; gap: 6px; }
.uf-mp-key { display: inline-block; width: 9px; height: 9px; background: color-mix(in srgb, var(--uf-loss) 45%, transparent); }
.uf-mp-key--win { background: var(--uf-win); }
.uf-mp-key--mark { width: 12px; height: 3px; background: var(--uf-red); }
</style>
