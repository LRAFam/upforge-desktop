<script setup lang="ts">
import type { PipelineStageId } from '../../lib/duel-moments'

defineProps<{
  stage: PipelineStageId
  state: 'done' | 'active' | 'pending'
}>()
</script>

<template>
  <!-- Match data — radar grid -->
  <svg v-if="stage === 'match_data'" class="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.2" opacity="0.7" />
    <path d="M8 2v3M8 11v3M2 8h3M11 8h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
    <circle cx="8" cy="8" r="1.5" fill="currentColor" />
  </svg>

  <!-- Duel windows — bracket reticle -->
  <svg v-else-if="stage === 'moments'" class="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 5h4V3H3v2zM9 3v2h4V3H9zM3 11h4v2H3v-2zM9 13v-2h4v2H9z" stroke="currentColor" stroke-width="1.1" />
    <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2" />
  </svg>

  <!-- Clip vision — scan eye -->
  <svg v-else-if="stage === 'vision'" class="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M2 8s2.5-4 6-4 6 4 6 4-2.5 4-6 4-6-4-6-4z" stroke="currentColor" stroke-width="1.2" />
    <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.2" />
    <path d="M8 6v4M6 8h4" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" :class="state === 'active' ? 'opacity-100' : 'opacity-0'" />
  </svg>

  <!-- Coach synthesis — forge flame -->
  <svg v-else class="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 14c2.5-2 3.5-4 3.5-6.2C11.5 4.5 9.8 3 8 3S4.5 4.5 4.5 7.8C4.5 10 5.5 12 8 14z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" />
    <path d="M8 11c1-1.2 1.4-2.2 1.4-3.4 0-1.3-.8-2.1-1.4-2.1s-1.4.8-1.4 2.1C6.6 8.8 7 9.8 8 11z" fill="currentColor" opacity="0.35" />
  </svg>
</template>
