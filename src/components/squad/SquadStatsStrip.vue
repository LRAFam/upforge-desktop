<script setup lang="ts">
import { computed } from 'vue'
import { gameBrand } from '../../lib/game-branding'
import { squadGamePillLabel } from '../../lib/squad-ui'
import type { PrimaryGame } from '../../lib/games'

const props = defineProps<{
  creditsRemaining: number | null
  creditsTotal: number | null
  onlineCount: number
  memberCount: number
  gameMix: Record<string, number>
}>()

const creditPct = computed(() => {
  if (props.creditsRemaining == null || !props.creditsTotal) return null
  return Math.round((props.creditsRemaining / props.creditsTotal) * 100)
})

const activeGames = computed(() =>
  (Object.entries(props.gameMix) as [PrimaryGame, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]),
)
</script>

<template>
  <div class="dash-panel flex overflow-hidden flex-shrink-0">
    <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5 px-2 border-r border-white/[0.06]">
      <span class="text-sm font-black tabular-nums text-white">{{ onlineCount }}</span>
      <span class="text-[8px] text-gray-600 uppercase tracking-wide text-center">Online</span>
    </div>
    <div class="flex-1 flex flex-col items-center py-2.5 gap-0.5 px-2 border-r border-white/[0.06]">
      <span class="text-sm font-black tabular-nums text-white">{{ memberCount }}</span>
      <span class="text-[8px] text-gray-600 uppercase tracking-wide text-center">Roster</span>
    </div>
    <div class="flex-[1.4] flex flex-col items-center py-2.5 gap-1 px-2 border-r border-white/[0.06] min-w-0">
      <template v-if="creditsRemaining != null && creditsTotal">
        <span class="text-sm font-black tabular-nums text-amber-300">{{ creditsRemaining }}<span class="text-gray-600 text-[11px]">/{{ creditsTotal }}</span></span>
        <div class="w-full max-w-[88px] h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div class="h-full bg-amber-500/80 rounded-full transition-all" :style="{ width: `${creditPct ?? 0}%` }" />
        </div>
        <span class="text-[8px] text-gray-600 uppercase tracking-wide">Shared credits</span>
      </template>
      <template v-else>
        <span class="text-sm font-black text-gray-600">—</span>
        <span class="text-[8px] text-gray-600 uppercase tracking-wide">Credits</span>
      </template>
    </div>
    <div class="flex-[1.2] flex flex-col items-center justify-center py-2 px-2 gap-1 min-w-0">
      <div v-if="activeGames.length" class="flex flex-wrap justify-center gap-1">
        <span
          v-for="[game, count] in activeGames"
          :key="game"
          class="text-[8px] font-black px-1.5 py-0.5 rounded border"
          :style="{
            color: gameBrand(game).accent,
            borderColor: `${gameBrand(game).accent}44`,
            background: `${gameBrand(game).accent}12`,
          }"
        >{{ squadGamePillLabel(game) }} · {{ count }}</span>
      </div>
      <span v-else class="text-[8px] text-gray-600 uppercase tracking-wide text-center">No live games</span>
      <span v-if="activeGames.length" class="text-[8px] text-gray-600 uppercase tracking-wide">Playing now</span>
    </div>
  </div>
</template>
