<script setup lang="ts">
import { computed } from 'vue'
import { useGameTheme } from '../../composables/useGameTheme'
import { gameCenterPanels } from '../../lib/game-modules'

const { primaryGame } = useGameTheme()
const panels = computed(() => gameCenterPanels(primaryGame.value))
</script>

<template>
  <component
    v-for="(Panel, index) in panels"
    :is="Panel"
    :key="`${primaryGame}-${index}`"
    class="flex-shrink-0"
  />
</template>
