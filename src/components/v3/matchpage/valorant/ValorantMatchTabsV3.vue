<script setup lang="ts">
/** Valorant deep tabs (board 18b): Rounds · Duels · Economy. Measured values only; whole numbers in sentences. */
import { computed, ref } from 'vue'
import UfTabs from '../../UfTabs.vue'
import { hasMeasured, type ValorantMatchView } from './valorant-match-view'

const props = defineProps<{ view: ValorantMatchView }>()
const emit = defineEmits<{ selectRound: [round: number] }>()
const tab = ref<'rounds' | 'duels' | 'economy'>('rounds')
const items = computed(() => [
  { key: 'rounds', label: 'Rounds', count: props.view.roundRows.length },
  { key: 'duels', label: 'Duels' },
  { key: 'economy', label: 'Economy' },
])
const won = computed(() => props.view.roundRows.filter(r => r.result === 'won').length)
const BUY: Record<string, string> = { pistol: 'Pistol', full: 'Full buy', half: 'Half buy', eco: 'Eco' }
</script>

<template>
  <div class="vmt">
    <div class="vmt-head">
      <div v-for="h in view.headline" :key="h.label" class="vmt-stat" :title="h.hint">
        <span class="uf-d4 uf-num">{{ h.value }}</span><span class="uf-t4">{{ h.label }}</span>
      </div>
    </div>
    <UfTabs v-model="tab" :items="items" size="filter" label="Valorant match stats" />

    <div v-if="tab === 'rounds'" class="vmt-body">
      <p class="uf-t4">Won {{ won }} of {{ view.roundRows.length }} rounds. Select a round to jump to it.</p>
      <div class="vmt-rounds" role="table" aria-label="Rounds">
        <button v-for="r in view.roundRows" :key="r.round" type="button" class="vmt-round" role="row" :aria-label="`Round ${r.round + 1}, ${r.result}`" @click="emit('selectRound', r.round)">
          <span class="uf-t4 uf-num" role="cell">R{{ r.round + 1 }}</span>
          <span class="vmt-mark" :class="`is-${r.result}`" role="cell" />
          <span class="uf-t3" role="cell">
            {{ r.ended }}<span v-if="r.plant" class="uf-t4"> · {{ r.plant }}</span><span v-if="r.buy" class="uf-t4"> · {{ BUY[r.buy] }}</span>
            <span v-if="r.opening === 'won'" class="uf-t4 vmt-open"> · Opening kill</span>
            <span v-else-if="r.opening === 'lost'" class="uf-t4 vmt-open"> · Died first</span>
          </span>
          <span class="uf-t4 uf-num" role="cell">
            <template v-if="r.kills != null && r.deaths != null">{{ r.kills }} {{ r.kills === 1 ? 'kill' : 'kills' }} · {{ r.deaths }} {{ r.deaths === 1 ? 'death' : 'deaths' }}</template>
            <template v-else>Not measured</template>
          </span>
        </button>
      </div>
    </div>

    <div v-else-if="tab === 'duels'" class="vmt-body">
      <div v-for="r in view.duels" :key="r.label" class="vmt-row"><span class="uf-t3">{{ r.label }}</span><span class="uf-t3 uf-num">{{ r.value }}</span></div>
      <template v-if="view.hits.length">
        <span class="uf-label vmt-sub">Where your hits landed</span>
        <div v-for="h in view.hits" :key="h.label" class="vmt-row" :title="h.hint"><span class="uf-t3">{{ h.label }}<span class="uf-t4"> · {{ h.hint }}</span></span><span class="uf-t3 uf-num">{{ h.value }}</span></div>
        <p class="uf-t4">Riot counts hits that landed, not shots fired, so this isn't accuracy.</p>
      </template>
      <template v-if="view.weapons.length">
        <span class="uf-label vmt-sub">Kills by weapon</span>
        <div v-for="w in view.weapons" :key="w.label" class="vmt-row"><span class="uf-t3">{{ w.label }}</span><span class="uf-t4 uf-num">{{ w.value }}</span></div>
      </template>
    </div>

    <div v-else class="vmt-body">
      <template v-if="view.economy.length && hasMeasured(view.economy)">
        <div v-for="r in view.economy" :key="r.band" class="vmt-row"><span class="uf-t3">{{ r.label }}</span><span class="uf-t3 uf-num">{{ r.value }}</span></div>
        <p class="uf-t4">Bands are by your loadout value at round start (full 3,900+, half 2,000+), not buy intent.</p>
      </template>
      <p v-else class="uf-t2">Loadout values weren't recorded for this match.</p>
    </div>
  </div>
</template>

<style scoped>
.vmt { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.vmt p { margin: 0; }
.vmt-head { display: flex; gap: 32px; flex-wrap: wrap; }
.vmt-stat { display: flex; flex-direction: column; gap: 4px; }
.vmt-body { display: flex; flex-direction: column; min-width: 0; }
.vmt-row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; border-top: 1px solid var(--uf-line); }
.vmt-sub { margin-top: 16px; margin-bottom: 4px; }
.vmt-rounds { display: flex; flex-direction: column; margin-top: 8px; }
.vmt-round { display: grid; grid-template-columns: 44px 10px 1fr auto; gap: 12px; align-items: center; padding: 7px 0; border: 0; border-top: 1px solid var(--uf-line); background: none; color: inherit; text-align: left; cursor: pointer; font: inherit; }
.vmt-round:hover { background: var(--uf-hover); }
.vmt-round:focus-visible { outline: 1px solid var(--uf-red); outline-offset: -1px; }
.vmt-mark { width: 10px; height: 10px; background: var(--uf-faint); }
.vmt-mark.is-won { background: var(--uf-win); }
.vmt-mark.is-lost { background: var(--uf-loss); }
.vmt-open { color: var(--uf-muted); }
.uf-num { font-variant-numeric: tabular-nums; }
</style>
