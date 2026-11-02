<script setup lang="ts">
/** A rank icon from `playerIdentity().rankIcon`. Renders nothing when there is no icon. */
withDefaults(defineProps<{ src: string | null; label?: string | null; size?: 16 | 18 | 20 | 24 | 32 }>(), { label: null, size: 18 })
</script>

<template>
  <img v-if="src" :src="src" :alt="label ?? ''" :title="label ?? undefined" class="ri" :style="{ width: `${size}px`, height: `${size}px` }" loading="lazy" decoding="async">
</template>

<style scoped>
.ri { flex: none; object-fit: contain; vertical-align: middle; }
</style>
