<script setup lang="ts">
/**
 * Every round at a glance: bar colour = won / lost, bar height = your buy, a square above for your
 * opening duel (filled = you got the first kill, outline = you died first), dots below for your
 * kills. Rounds the coach looked at are underlined. Click a round to jump to it.
 */
import { computed } from 'vue'
import type { RoundCell } from './coach-visuals'

const props = withDefaults(defineProps<{ cells: RoundCell[]; selected?: number | null; halfAt?: number }>(), { selected: null, halfAt: 12 })
defineEmits<{ select: [round: number] }>()

const BUY_H: Record<string, number> = { eco: 10, pistol: 14, half: 20, full: 30 }
const barH = (c: RoundCell) => (c.buy ? BUY_H[c.buy] : 16)
const showLabel = (c: RoundCell) => c.round === 1 || c.round % 5 === 0 || c.marked || c.round === props.cells.length
const won = computed(() => props.cells.filter(c => c.result === 'won').length)
const known = computed(() => props.cells.filter(c => c.result !== 'unknown').length)
const BUY_WORD: Record<string, string> = { eco: 'eco', pistol: 'pistol', half: 'half buy', full: 'full buy' }
const aria = (c: RoundCell) => [
  `Round ${c.round}: ${c.result === 'unknown' ? 'result unknown' : c.result}`,
  c.buy ? BUY_WORD[c.buy] : null,
  c.opening === 'won' ? 'you got the first kill' : c.opening === 'lost' ? 'you died first' : null,
  c.kills != null ? `${c.kills} ${c.kills === 1 ? 'kill' : 'kills'}` : null,
  c.marked ? 'reviewed by the coach' : null,
].filter(Boolean).join(', ')
</script>

<template>
  <div class="rs3">
    <div class="rs3-grid" role="list" aria-label="Rounds">
      <template v-for="(c, i) in cells" :key="c.round">
        <span v-if="i === halfAt" class="rs3-half" aria-hidden="true" />
        <button type="button" role="listitem" class="rs3-cell" :class="{ 'is-sel': selected === c.round, 'is-marked': c.marked }"
          :aria-label="aria(c)" :aria-pressed="selected === c.round" @click="$emit('select', c.round)">
          <span class="rs3-open" :class="c.opening ? `is-${c.opening}` : ''" />
          <span class="rs3-track">
            <span class="rs3-bar uf-grow" :class="`is-${c.result}`" :style="{ height: `${barH(c)}px`, animationDelay: `${i * 12}ms` }" />
          </span>
          <span class="rs3-kills" aria-hidden="true">
            <i v-for="k in Math.min(5, c.kills ?? 0)" :key="k" />
          </span>
          <span class="rs3-num uf-t4" :class="{ 'is-on': showLabel(c) }">{{ c.round }}</span>
        </button>
      </template>
    </div>
    <p class="rs3-legend uf-t4">
      <span><b class="uf-num">{{ won }}–{{ known - won }}</b> rounds</span>
      <span>Bar height: your buy</span>
      <span><i class="rs3-k is-won" /> you opened · <i class="rs3-k is-lost" /> died first</span>
      <span><i class="rs3-dot" /> your kills</span>
      <span v-if="cells.some(c => c.marked)"><i class="rs3-u" /> coach reviewed</span>
    </p>
  </div>
</template>

<style scoped>
.rs3 { display: flex; flex-direction: column; gap: 10px; }
.rs3-grid { display: flex; align-items: stretch; gap: 3px; }
.rs3-half { width: 10px; flex: none; border-left: 1px solid var(--uf-line-2); margin-left: 4px; }
.rs3-cell { flex: 1 1 0; min-width: 14px; max-width: 34px; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 4px 0 2px; background: none; border: 0; border-bottom: 2px solid transparent; cursor: pointer; color: inherit; }
.rs3-cell:hover { background: var(--uf-hover); }
.rs3-cell.is-sel { background: var(--uf-raised); }
.rs3-cell.is-marked { border-bottom-color: var(--uf-bone); }
.rs3-cell:focus-visible { outline: 1px solid var(--uf-bone); outline-offset: 1px; }
.rs3-open { width: 7px; height: 7px; flex: none; }
.rs3-open.is-won { background: var(--uf-bone); }
.rs3-open.is-lost { border: 1px solid var(--uf-loss); }
.rs3-track { height: 30px; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.rs3-bar { width: 72%; display: block; transform-origin: bottom; }
.rs3-bar.is-won { background: var(--uf-win); }
.rs3-bar.is-lost { background: var(--uf-loss); opacity: 0.75; }
.rs3-bar.is-unknown { background: var(--uf-faint); }
.rs3-kills { height: 22px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.rs3-kills i { width: 6px; height: 3px; background: var(--uf-bone); display: block; }
.rs3-num { opacity: 0; font-variant-numeric: tabular-nums; }
.rs3-num.is-on { opacity: 1; }
.rs3-cell.is-marked .rs3-num { color: var(--uf-bone); font-weight: 600; }
.rs3-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; }
.rs3-legend span { display: inline-flex; align-items: center; gap: 6px; }
.rs3-legend b { color: var(--uf-bone); font-weight: 600; }
.rs3-k { width: 7px; height: 7px; display: inline-block; }
.rs3-k.is-won { background: var(--uf-bone); }
.rs3-k.is-lost { border: 1px solid var(--uf-loss); }
.rs3-dot { width: 6px; height: 3px; display: inline-block; background: var(--uf-bone); }
.rs3-u { width: 12px; height: 2px; display: inline-block; background: var(--uf-bone); }
.uf-num { font-variant-numeric: tabular-nums; }
</style>
