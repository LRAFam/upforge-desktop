<script setup lang="ts">
/** One quiet line under a moment's title: round result, your buy, your opening duel, round time. */
import { computed } from 'vue'
import { roundOutcome, mmss } from './coach-visuals'

const props = withDefaults(defineProps<{ matchData: Record<string, unknown> | null; round: number; roundMs?: number | null; showRound?: boolean }>(), { roundMs: null, showRound: true })
const o = computed(() => roundOutcome(props.matchData, props.round))
const parts = computed(() => {
  const x = o.value
  const out: Array<{ text: string; tone?: 'win' | 'loss' }> = props.showRound ? [{ text: `Round ${props.round}` }] : []
  if (x?.result === 'won') out.push({ text: 'Won', tone: 'win' })
  else if (x?.result === 'lost') out.push({ text: 'Lost', tone: 'loss' })
  if (x?.buy) out.push({ text: x.buy })
  if (x?.opening === 'won') out.push({ text: 'You won the opening duel' })
  else if (x?.opening === 'lost') out.push({ text: 'You died first' })
  if (typeof props.roundMs === 'number') out.push({ text: `${mmss(props.roundMs)} into the round` })
  return out
})
</script>

<template>
  <p class="ol3 uf-t4">
    <template v-for="(p, i) in parts" :key="i">
      <span v-if="i" class="ol3-sep" aria-hidden="true">·</span>
      <span :class="p.tone ? `is-${p.tone}` : ''">{{ p.text }}</span>
    </template>
  </p>
</template>

<style scoped>
.ol3 { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.ol3-sep { color: var(--uf-line-2); }
.is-win { color: var(--uf-win); font-weight: 600; }
.is-loss { color: var(--uf-loss); font-weight: 600; }
</style>
