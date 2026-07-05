<script setup lang="ts">
import { computed } from 'vue'
import { useGameTheme } from '../../composables/useGameTheme'
import CS2SetupPanel from '../CS2SetupPanel.vue'
import DeadlockDemoPanel from '../DeadlockDemoPanel.vue'

const { primaryGame } = useGameTheme()

const panel = computed(() => {
  if (primaryGame.value === 'cs2') return CS2SetupPanel
  if (primaryGame.value === 'deadlock') return DeadlockDemoPanel
  return null
})
</script>

<template>
  <component :is="panel" v-if="panel" class="flex-shrink-0 max-h-48 overflow-hidden" />
</template>
