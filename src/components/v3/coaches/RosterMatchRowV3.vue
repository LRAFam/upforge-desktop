<script setup lang="ts">
/** One match as a hairline row: map art, agent, map + subtitle, round score, and an optional action. */
import { computed } from 'vue'
import { getMapListViewImage } from '../../../lib/valorant'
import { rosterAgentImage, rosterMapLabel, rosterMatchGame, type RosterMatchVisual } from '../../../lib/roster-match-display'
import { resultTone, roundScore } from './coach-format'

const props = defineProps<{ match: RosterMatchVisual; subtitle?: string; status?: string; statusTone?: 'win' | 'muted' }>()
defineEmits<{ open: [] }>()

const map = computed(() => rosterMapLabel(props.match))
const art = computed(() => (rosterMatchGame(props.match) === 'valorant' && props.match.map ? getMapListViewImage(props.match.map) || '' : ''))
const agent = computed(() => rosterAgentImage(props.match))
const score = computed(() => roundScore(props.match.rounds_won, props.match.rounds_lost))
const tone = computed(() => resultTone(props.match))
</script>

<template>
  <div class="uf-mrow">
    <button type="button" class="uf-mrow-main" @click="$emit('open')">
      <span class="uf-mrow-art"><img v-if="art" :src="art" alt=""></span>
      <img v-if="agent" :src="agent" alt="" class="uf-mrow-agent">
      <span class="uf-mrow-text">
        <span class="uf-t3">{{ map }}</span>
        <span v-if="subtitle" class="uf-t4">{{ subtitle }}</span>
      </span>
      <span v-if="status" class="uf-mrow-status" :style="{ color: statusTone === 'win' ? 'var(--uf-win)' : 'var(--uf-muted)' }">{{ status }}</span>
      <span v-if="score" class="uf-d4" :style="{ color: tone === 'win' ? 'var(--uf-win)' : tone === 'loss' ? 'var(--uf-loss)' : 'var(--uf-bone)' }">{{ score }}</span>
    </button>
    <div v-if="$slots.action" class="uf-mrow-action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.uf-mrow { display: flex; align-items: center; gap: 16px; border-top: 1px solid var(--uf-line); }
.uf-mrow-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 14px; padding: 10px 0; background: none; border: 0; color: inherit; cursor: pointer; text-align: left; }
.uf-mrow-main:hover .uf-t3 { color: #fff; }
.uf-mrow-art { width: 96px; height: 54px; flex: none; background: var(--uf-raised); overflow: hidden; }
.uf-mrow-art img { width: 100%; height: 100%; object-fit: cover; filter: saturate(0.7); }
.uf-mrow-agent { width: 32px; height: 32px; flex: none; object-fit: cover; }
.uf-mrow-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.uf-mrow-text > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.uf-mrow-status { font: 600 13px/1 var(--uf-body); white-space: nowrap; }
.uf-mrow-action { flex: none; }
</style>
