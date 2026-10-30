<script setup lang="ts">
/** One drill in the library: clickable as a whole, so it gets the raised surface. Real PB and rank only. */
import { computed } from 'vue'
import { difficultyLabel, durationLabel, personalBestLabel } from './practice-v3'

const props = defineProps<{
  label: string
  description: string
  iconSrc: string
  difficulty: string
  durationSeconds: number
  personalBest: number | null
  globalRank: number | null
  completed: boolean
  running: boolean
  disabled: boolean
}>()
defineEmits<{ play: [] }>()

const meta = computed(() => [difficultyLabel(props.difficulty), durationLabel(props.durationSeconds)].filter(Boolean).join(' · '))
const pb = computed(() => personalBestLabel(props.personalBest))
</script>

<template>
  <button type="button" class="uf-drill" :class="{ 'is-running': running, 'is-done': completed }" :disabled="disabled"
    :aria-label="`Play ${label}`" @click="$emit('play')">
    <span class="uf-drill-top">
      <img :src="iconSrc" alt="" class="uf-drill-icon">
      <span class="uf-drill-name">
        <span class="uf-t3">{{ label }}</span>
        <span class="uf-t4">{{ meta }}</span>
      </span>
    </span>
    <span class="uf-t4 uf-drill-desc">{{ description }}</span>
    <span class="uf-drill-foot">
      <span class="uf-drill-pb">
        <span class="uf-t4">Personal best</span>
        <span :class="personalBest === null ? 'uf-t3' : 'uf-d4'" :style="personalBest === null ? 'color: var(--uf-faint)' : undefined">{{ pb }}</span>
      </span>
      <span v-if="running" class="uf-t4 uf-live" style="color: var(--uf-red)">Running</span>
      <span v-else-if="completed" class="uf-t4" style="color: var(--uf-win)">Played today</span>
      <span v-else-if="globalRank" class="uf-t4">Rank #{{ globalRank }}</span>
    </span>
  </button>
</template>

<style scoped>
.uf-drill { display: flex; flex-direction: column; gap: 10px; padding: 14px; text-align: left; cursor: pointer; background: var(--uf-raised); border: 0; color: inherit; box-shadow: inset 0 0 0 1px var(--uf-line); }
.uf-drill:hover:not(:disabled) { background: var(--uf-hover); }
.uf-drill:disabled { opacity: 0.45; cursor: not-allowed; }
.uf-drill.is-running { box-shadow: inset 2px 0 0 var(--uf-red), inset 0 0 0 1px var(--uf-line); }
.uf-drill-top { display: flex; gap: 12px; align-items: center; }
.uf-drill-icon { width: 40px; height: 40px; flex: none; }
.uf-drill-name { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.uf-drill-desc { line-height: 1.45; }
.uf-drill-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--uf-line); }
.uf-drill-pb { display: flex; flex-direction: column; gap: 4px; }
</style>
