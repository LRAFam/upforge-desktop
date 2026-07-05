<script setup lang="ts">
import { computed } from 'vue'
import type { PrimaryGame } from '../../lib/games'
import { gameBrand } from '../../lib/game-branding'

const props = withDefaults(defineProps<{
  game: PrimaryGame
  active?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  active: false,
  size: 'md',
})

const brand = computed(() => gameBrand(props.game))

const sizeClass = computed(() => {
  if (props.size === 'sm') return 'h-4 w-4'
  if (props.size === 'lg') return 'h-6 w-6'
  return 'h-[18px] w-[18px]'
})
</script>

<template>
  <img
    :src="brand.logo"
    alt=""
    class="object-contain flex-shrink-0 transition-[filter,opacity] duration-200"
    :class="[
      sizeClass,
      game === 'cs2' || game === 'deadlock' ? 'rounded-[3px]' : '',
      active ? 'game-brand-icon--active' : 'game-brand-icon--idle',
    ]"
  />
</template>

<style scoped>
.game-brand-icon--active {
  opacity: 1;
  filter: none;
}
.game-brand-icon--idle {
  opacity: 0.45;
  filter: grayscale(1) brightness(0.85);
}
</style>
