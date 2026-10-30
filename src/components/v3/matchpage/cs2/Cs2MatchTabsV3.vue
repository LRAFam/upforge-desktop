<script setup lang="ts">
/** CS2 deep tabs (board 20/20b): Rounds · Duels · Utility · Economy. Measured values only. */
import { computed, ref } from 'vue'
import UfTabs from '../../UfTabs.vue'
import { hasMeasured, type Cs2MatchView } from './cs2-match-view'

const props = defineProps<{ view: Cs2MatchView }>()
const tab = ref<'rounds' | 'duels' | 'utility' | 'economy'>(props.view.roundRows.length ? 'rounds' : 'duels')
const items = computed(() => [
  ...(props.view.roundRows.length ? [{ key: 'rounds', label: 'Rounds', count: props.view.roundRows.length }] : []),
  { key: 'duels', label: 'Duels' },
  { key: 'utility', label: 'Utility' },
  { key: 'economy', label: 'Economy' },
])
const won = computed(() => props.view.roundRows.filter(r => r.result === 'won').length)
</script>

<template>
  <div class="c2t">
    <div class="c2t-head">
      <div v-for="h in view.headline" :key="h.label" class="c2t-stat" :title="h.hint">
        <span class="uf-d4 uf-num">{{ h.value }}</span><span class="uf-t4">{{ h.label }}</span>
      </div>
    </div>
    <UfTabs v-model="tab" :items="items" size="filter" label="CS2 match stats" />

    <div v-if="tab === 'rounds'" class="c2t-body">
      <p class="uf-t4">Won {{ won }} of {{ view.roundRows.length }} rounds. Your kills and deaths per round come from the demo.</p>
      <div class="c2t-rounds" role="table" aria-label="Rounds">
        <div v-for="r in view.roundRows" :key="r.round" class="c2t-round" role="row">
          <span class="uf-t4 uf-num" role="cell">R{{ r.round }}</span>
          <span class="c2t-mark" :class="`is-${r.result}`" role="cell" :aria-label="r.result" />
          <span class="uf-t3" role="cell">{{ r.ended }}<span v-if="r.plant" class="uf-t4"> · {{ r.plant }}</span></span>
          <span class="uf-t4 uf-num" role="cell">{{ r.kills }} {{ r.kills === 1 ? 'kill' : 'kills' }} · {{ r.deaths }} {{ r.deaths === 1 ? 'death' : 'deaths' }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="tab === 'duels'" class="c2t-body">
      <div v-for="r in view.duels" :key="r.label" class="c2t-row"><span class="uf-t3">{{ r.label }}</span><span class="uf-t3 uf-num">{{ r.value }}</span></div>
      <div v-for="r in view.sides" :key="r.label" class="c2t-row"><span class="uf-t3">{{ r.label }}</span><span class="uf-t3 uf-num">{{ r.value }}</span></div>
      <template v-if="view.weapons.length">
        <span class="uf-label c2t-sub">Kills by weapon</span>
        <div v-for="w in view.weapons" :key="w.label" class="c2t-row"><span class="uf-t3">{{ w.label }}</span><span class="uf-t4 uf-num">{{ w.value }}</span></div>
      </template>
    </div>

    <div v-else-if="tab === 'utility'" class="c2t-body">
      <template v-if="hasMeasured(view.utility)">
        <div v-for="r in view.utility" :key="r.label" class="c2t-row"><span class="uf-t3">{{ r.label }}</span><span class="uf-t3 uf-num">{{ r.value }}</span></div>
      </template>
      <p v-else class="uf-t2">Utility wasn't measured in this demo.</p>
    </div>

    <div v-else class="c2t-body">
      <template v-if="hasMeasured(view.economy)">
        <div v-for="r in view.economy" :key="r.label" class="c2t-row" :title="r.hint"><span class="uf-t3">{{ r.label }}<span v-if="r.hint" class="uf-t4"> · {{ r.hint }}</span></span><span class="uf-t3 uf-num">{{ r.value }}</span></div>
        <p class="uf-t4">Bands are by equipment value at round start, not buy intent.</p>
      </template>
      <p v-else class="uf-t2">Equipment values weren't measured in this demo.</p>
    </div>
  </div>
</template>

<style scoped>
.c2t { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.c2t p { margin: 0; }
.c2t-head { display: flex; gap: 32px; flex-wrap: wrap; }
.c2t-stat { display: flex; flex-direction: column; gap: 4px; }
.c2t-body { display: flex; flex-direction: column; min-width: 0; }
.c2t-row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.c2t-sub { margin-top: 16px; margin-bottom: 4px; }
.c2t-rounds { display: flex; flex-direction: column; margin-top: 8px; }
.c2t-round { display: grid; grid-template-columns: 44px 10px 1fr auto; gap: 12px; align-items: center; padding: 7px 0; border-top: 1px solid var(--uf-line); }
.c2t-mark { width: 10px; height: 10px; background: var(--uf-faint); }
.c2t-mark.is-won { background: var(--uf-win); }
.c2t-mark.is-lost { background: var(--uf-loss); }
.uf-num { font-variant-numeric: tabular-nums; }
</style>
