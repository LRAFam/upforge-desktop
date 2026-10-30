<script setup lang="ts">
/** Placeholder block. Give it the size of what it replaces: `w`/`h` (px or CSS), or `lines` of text. */
withDefaults(defineProps<{ w?: number | string; h?: number | string; lines?: number }>(), { w: '100%', h: 16, lines: 0 })
const size = (v: number | string) => (typeof v === 'number' ? `${v}px` : v)
</script>

<template>
  <span v-if="lines" aria-hidden="true" style="display: block">
    <span v-for="i in lines" :key="i" class="uf-skel uf-skel-text" :style="{ width: i === lines && lines > 1 ? '62%' : size(w) }" />
  </span>
  <span v-else aria-hidden="true" class="uf-skel" :style="{ width: size(w), height: size(h) }" />
</template>
