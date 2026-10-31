<script setup lang="ts">
/**
 * Your numbers for the match, as a few big figures and bars inside rows: opening duels, rounds won
 * by your buy, and where your hits landed (only when Riot's hit regions were kept).
 */
import { computed } from 'vue'
import type { Bar, NumbersView } from './coach-visuals'

const props = defineProps<{ numbers: NumbersView }>()
const pct = (b: Bar) => (b.of ? Math.round((b.value / b.of) * 100) : 0)
const opening = computed(() => props.numbers.openings)
const openTotal = computed(() => (opening.value ? opening.value.won + opening.value.lost : 0))
</script>

<template>
  <div class="nb3">
    <dl class="nb3-stats">
      <div v-for="s in numbers.stats" :key="s.label" class="nb3-stat">
        <dd class="uf-d3 uf-num">{{ s.value }}</dd>
        <dt class="uf-t4">{{ s.label }}</dt>
      </div>
    </dl>

    <div class="nb3-cols">
      <section v-if="opening" class="nb3-block">
        <span class="uf-label">Opening duels</span>
        <div class="nb3-split" role="img" :aria-label="`Won ${opening.won} of ${openTotal} opening duels`">
          <span class="nb3-split-won uf-fill" :style="{ flexGrow: opening.won }" />
          <span class="nb3-split-lost uf-fill" :style="{ flexGrow: opening.lost }" />
        </div>
        <p class="uf-t4">Won <b class="uf-num">{{ opening.won }}</b> of <b class="uf-num">{{ openTotal }}</b> first fights you were in</p>
      </section>

      <section v-if="numbers.economy.length" class="nb3-block">
        <span class="uf-label">Rounds won by your buy</span>
        <div v-for="b in numbers.economy" :key="b.label" class="nb3-row">
          <span class="uf-t4 nb3-lbl">{{ b.label }}</span>
          <span class="nb3-track"><span class="nb3-fill uf-fill" :class="`is-${b.tone ?? 'none'}`" :style="{ width: `${pct(b)}%` }" /></span>
          <span class="uf-t3 uf-num nb3-val">{{ b.text }}</span>
        </div>
      </section>

      <section v-if="numbers.hits.length" class="nb3-block">
        <span class="uf-label">Where your hits landed</span>
        <div v-for="b in numbers.hits" :key="b.label" class="nb3-row">
          <span class="uf-t4 nb3-lbl">{{ b.label }}</span>
          <span class="nb3-track"><span class="nb3-fill uf-fill" :style="{ width: `${pct(b)}%` }" /></span>
          <span class="uf-t3 uf-num nb3-val">{{ b.text }}</span>
        </div>
        <p class="uf-t4">Hits landed, not shots fired.</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.nb3 { display: flex; flex-direction: column; gap: 22px; }
.nb3-stats { display: flex; gap: 40px; margin: 0; flex-wrap: wrap; }
.nb3-stat { display: flex; flex-direction: column-reverse; gap: 2px; }
.nb3-stat dd, .nb3-stat dt { margin: 0; }
.nb3-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 28px 40px; }
.nb3-block { display: flex; flex-direction: column; gap: 8px; }
.nb3-block p { margin: 0; }
.nb3-block b { color: var(--uf-bone); font-weight: 600; }
.nb3-split { display: flex; height: 8px; gap: 2px; }
.nb3-split span { display: block; flex-basis: 0; }
.nb3-split-won { background: var(--uf-win); }
.nb3-split-lost { background: var(--uf-loss); opacity: 0.75; }
.nb3-row { display: grid; grid-template-columns: 74px minmax(0, 1fr) 64px; gap: 10px; align-items: center; padding: 4px 0; }
.nb3-track { height: 6px; background: var(--uf-raised); display: block; }
.nb3-fill { display: block; height: 100%; background: var(--uf-bone); transform-origin: left; }
.nb3-fill.is-win { background: var(--uf-win); }
.nb3-fill.is-loss { background: var(--uf-loss); opacity: 0.75; }
.nb3-val { text-align: right; }
.uf-num { font-variant-numeric: tabular-nums; }
</style>
