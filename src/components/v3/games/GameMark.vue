<script setup lang="ts">
/** Section label with the game's logo and its accent line (one game accent at a time). */
import { computed } from 'vue'
import { gameBrand } from '../../../lib/game-branding'
import { GAME_ACCENT, GAME_NAME, type DemoGame } from './game-data'

const props = defineProps<{ game: DemoGame; label: string }>()
const logo = computed(() => gameBrand(props.game).logo)
</script>

<template>
  <div class="gmark" :style="{ borderTopColor: GAME_ACCENT[game] }">
    <img :src="logo" alt="" width="18" height="18">
    <span class="uf-label">{{ GAME_NAME[game] }} · {{ label }}</span>
    <slot />
  </div>
</template>

<style scoped>
.gmark { display: flex; align-items: center; gap: 10px; padding-top: 12px; border-top: 2px solid; }
.gmark img { object-fit: contain; flex: none; }
.gmark > :deep(:last-child:not(.uf-label):not(img)) { margin-left: auto; }
</style>
