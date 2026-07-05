<script setup lang="ts">
import { usePrimaryGame } from '../../composables/usePrimaryGame'
import { PRIMARY_GAMES } from '../../lib/games'
import { gameBrand } from '../../lib/game-branding'
import GameBrandIcon from './GameBrandIcon.vue'

const { primaryGame, setPrimaryGame } = usePrimaryGame()

async function pick(id: typeof primaryGame.value) {
  if (id === primaryGame.value) return
  await setPrimaryGame(id)
}
</script>

<template>
  <div class="flex items-end gap-8 border-b border-white/[0.08] pb-0">
    <button
      v-for="g in PRIMARY_GAMES"
      :key="g.id"
      type="button"
      class="relative flex items-center gap-3 pb-3.5 text-[14px] font-black uppercase tracking-[0.06em] transition-colors duration-200"
      :class="primaryGame === g.id ? 'text-white' : 'text-gray-600 hover:text-gray-400'"
      @click="pick(g.id)"
    >
      <GameBrandIcon :game="g.id" :active="primaryGame === g.id" size="lg" />
      <span :class="primaryGame === g.id ? '' : 'opacity-70'">{{ gameBrand(g.id).wordmark }}</span>
      <span
        v-if="primaryGame === g.id"
        class="absolute inset-x-0 -bottom-px h-[2px] rounded-full"
        :style="{ background: `linear-gradient(90deg, ${gameBrand(g.id).accent}, ${gameBrand(g.id).accent}44)` }"
      />
    </button>
  </div>
</template>
