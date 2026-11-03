<script setup lang="ts">
/**
 * "Why 612?" — a quiet disclosure under the UpForge score: each stats input as one plain row with
 * a percentile bar (rulebook rule 6: bars inside rows), and who the match was compared with.
 * Only real API data (upforge_score_breakdown); the caller hides it when there is no breakdown.
 */
import { computed, ref, useId } from 'vue'
import { baselineLine, breakdownRows, type UpforgeScoreBreakdown } from '../../../lib/upforge-score-breakdown'

const props = defineProps<{ score: number; breakdown: UpforgeScoreBreakdown }>()

const open = ref(false)
const id = useId()
const rows = computed(() => breakdownRows(props.breakdown))
const baseline = computed(() => baselineLine(props.breakdown.baseline))
</script>

<template>
  <div class="sw3">
    <button type="button" class="uf-link" :aria-expanded="open" :aria-controls="id" @click="open = !open">
      {{ open ? 'Hide' : `Why ${score}?` }}
    </button>
    <div v-show="open" :id="id" class="sw3-body">
      <p class="uf-t4 sw3-p">{{ baseline }}. 500 is an average game for that group.<template v-if="breakdown.credit"> {{ breakdown.credit }}.</template></p>
      <div v-for="r in rows" :key="r.key" class="sw3-row">
        <span class="uf-t3">{{ r.text }}</span>
        <span class="sw3-bar" aria-hidden="true"><span class="sw3-fill" :style="{ width: `${r.percentile}%` }" /></span>
        <span class="uf-t4 sw3-share">{{ r.share }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sw3 { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
.sw3-body { align-self: stretch; display: flex; flex-direction: column; }
.sw3-p { margin: 0 0 6px; }
.sw3-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'text share' 'bar bar'; align-items: baseline; gap: 6px 16px; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.sw3-row > .uf-t3 { grid-area: text; }
.sw3-share { grid-area: share; }
.sw3-bar { grid-area: bar; height: 4px; background: var(--uf-line); position: relative; }
.sw3-fill { position: absolute; inset: 0 auto 0 0; background: var(--uf-bone); opacity: 0.7; }
.sw3-share { text-align: right; white-space: nowrap; }
</style>
