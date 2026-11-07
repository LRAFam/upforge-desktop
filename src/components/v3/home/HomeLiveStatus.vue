<script setup lang="ts">
/** One quiet line on Home while the pipeline is busy (recording, uploading, analysing, waiting). */
import type { HomeLiveStatus } from './home-v3'

defineProps<{ status: HomeLiveStatus; busy?: boolean }>()
defineEmits<{ stop: []; open: []; review: [] }>()
</script>

<template>
  <p class="hls" role="status" aria-live="polite">
    <span class="hls-dot uf-live" :class="`hls-dot--${status.kind}`" aria-hidden="true" />
    <span class="uf-t4 hls-text">{{ status.text }}</span>
    <button v-if="status.action === 'stop'" type="button" class="uf-link" :disabled="busy" @click="$emit('stop')">Stop recording →</button>
    <button v-else-if="status.action === 'matches'" type="button" class="uf-link" @click="$emit('open')">Follow in Matches →</button>
    <button v-else-if="status.action === 'review'" type="button" class="uf-link" @click="$emit('review')">Open coaching →</button>
  </p>
</template>

<style scoped>
.hls { margin: 0; display: flex; align-items: center; gap: 10px; }
.hls-dot { width: 6px; height: 6px; border-radius: 3px; background: var(--uf-muted); flex: none; }
.hls-dot--recording { background: var(--uf-red); }
.hls-dot--waiting { background: var(--uf-gold); }
.hls-dot--ready { background: var(--uf-win); }
.hls-dot--ready + .hls-text { color: var(--uf-bone); }
.hls-text { color: var(--uf-muted); }
</style>
