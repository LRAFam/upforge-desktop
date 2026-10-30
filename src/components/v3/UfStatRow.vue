<script setup lang="ts">
/** Key numbers in a row, split by hairlines (D3 number, T3 caption, T4 sub). No boxes. */
defineProps<{ items: Array<{ value: string; caption: string; sub?: string; tone?: 'win' | 'loss' }> }>()
</script>

<template>
  <div class="uf-stat-row">
    <template v-for="(s, i) in items" :key="i">
      <div v-if="i > 0" class="uf-hair-v" />
      <div class="uf-stat">
        <span class="uf-d3" :style="s.tone ? { color: s.tone === 'win' ? 'var(--uf-win)' : 'var(--uf-loss)' } : undefined">{{ s.value }}</span>
        <span class="uf-t3">{{ s.caption }}</span>
        <span v-if="s.sub" class="uf-t4">{{ s.sub }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.uf-stat-row { display: flex; margin: 0 -24px; }
.uf-stat { flex: 1; display: flex; flex-direction: column; gap: 4px; padding: 0 24px; }
.uf-stat .uf-d3 { margin-bottom: 4px; }
</style>
