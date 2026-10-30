<script setup lang="ts">
/**
 * The match as a shape: one bar per round. Wins tall (teal), losses short (dim);
 * a red tick under a round marks the focus event (e.g. "you died first").
 */
withDefaults(defineProps<{
  rounds: Array<{ won: boolean; marked?: boolean }>
  selected?: number | null
  halfAt?: number
  height?: number
}>(), { selected: null, halfAt: 12, height: 34 })
defineEmits<{ select: [round: number] }>()
</script>

<template>
  <div class="uf-rounds" role="list" aria-label="Rounds">
    <template v-for="(r, i) in rounds" :key="i">
      <div v-if="i === halfAt" class="uf-rounds-gap" />
      <button type="button" role="listitem" class="uf-round" :aria-label="`Round ${i + 1}: ${r.won ? 'won' : 'lost'}${r.marked ? ', marked' : ''}`"
        :aria-pressed="selected === i + 1" @click="$emit('select', i + 1)">
        <span class="uf-round-track" :style="{ height: `${height}px` }">
          <span class="uf-round-bar uf-grow" :class="{ 'is-win': r.won, 'is-selected': selected === i + 1 }"
            :style="{ height: `${r.won ? height : Math.round(height * 0.45)}px`, animationDelay: `${i * 0.03}s` }" />
        </span>
        <span class="uf-round-tick" :class="{ 'is-marked': r.marked }" />
        <span class="uf-round-n">{{ i + 1 }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.uf-rounds { display: flex; gap: 3px; align-items: flex-start; }
.uf-rounds-gap { width: 8px; flex: none; }
.uf-round { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; background: none; border: 0; padding: 0; cursor: pointer; min-width: 0; }
.uf-round-track { width: 100%; display: flex; align-items: flex-end; }
.uf-round-bar { width: 100%; background: rgba(236, 232, 225, 0.22); }
.uf-round-bar.is-win { background: var(--uf-win); }
.uf-round-bar.is-selected { outline: 1px solid var(--uf-bone); outline-offset: 2px; }
.uf-round-tick { width: 100%; height: 3px; background: transparent; }
.uf-round-tick.is-marked { background: var(--uf-red); }
.uf-round-n { font-size: 10px; color: var(--uf-faint); font-variant-numeric: tabular-nums; }
</style>
