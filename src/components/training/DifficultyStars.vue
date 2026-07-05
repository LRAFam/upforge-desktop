<script setup lang="ts">
import { computed } from 'vue'
import type { TrainerDifficulty } from '../../lib/trainer-scenarios'
import { difficultyStarCount } from '../../lib/training-ui'

const props = defineProps<{
  difficulty: TrainerDifficulty
  size?: 'sm' | 'md'
}>()

const filled = computed(() => difficultyStarCount(props.difficulty))
const sizeClass = computed(() => (props.size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'))
</script>

<template>
  <span class="inline-flex items-center gap-0.5" :title="difficulty">
    <svg
      v-for="i in 4"
      :key="i"
      viewBox="0 0 24 24"
      :class="[sizeClass, i <= filled ? 'text-amber-400' : 'text-white/15']"
      fill="currentColor"
    >
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.2 22 12 18.56 5.8 22 7 14.14l-5-4.87 7.1-1.01L12 2z" />
    </svg>
  </span>
</template>
