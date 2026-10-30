<script setup lang="ts">
/** One quiet line on Home while the pipeline is busy (recording, uploading, analysing, waiting). */
import type { HomeLiveStatus } from './home-v3'

defineProps<{ status: HomeLiveStatus; busy?: boolean }>()
defineEmits<{ stop: []; open: [] }>()
</script>

<template>
  <p class="hls" role="status" aria-live="polite">
    <span class="hls-dot uf-live" :class="`hls-dot--${status.kind}`" aria-hidden="true" />
    <span class="uf-t4 hls-text">{{ status.text }}</span>
    <button v-if="status.action === 'stop'" type="button" class="uf-link" :disabled="busy" @click="$emit('stop')">Stop recording →</button>
    <button v-else-if="status.action === 'matches'" type="button" class="uf-link" @click="$emit('open')">Follow in Matches →</button>
  </p>
</template>

<style scoped>
.hls { margin: 0; display: flex; align-items: center; gap: 10px; }
.hls-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--uf-muted); flex: none; }
.hls-dot--recording { background: var(--uf-red); }
.hls-dot--waiting { background: var(--uf-gold); }
.hls-text { color: var(--uf-muted); }
</style>
