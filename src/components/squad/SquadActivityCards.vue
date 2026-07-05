<script setup lang="ts">
import { computed } from 'vue'
import { gameBrand } from '../../lib/game-branding'
import { getMapImage } from '../../lib/valorant'
import {
  inferActivityGame,
  squadMemberColor,
  squadMemberInitials,
  squadTimeAgo,
} from '../../lib/squad-ui'
import type { PrimaryGame } from '../../lib/games'

export interface SquadActivityItem {
  id: number
  user_id: number
  user_name?: string
  map?: string | null
  agent?: string | null
  result?: string | null
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  created_at?: string
  share_token?: string | null
  game?: string | null
}

const props = defineProps<{
  items: SquadActivityItem[]
  memberName: (userId: number) => string
  memberIndex: (userId: number) => number
}>()

const emit = defineEmits<{ open: [item: SquadActivityItem] }>()

const cards = computed(() => props.items.slice(0, 3))

function gameFor(item: SquadActivityItem): PrimaryGame {
  return inferActivityGame(item)
}

function scoreLine(item: SquadActivityItem): string {
  if (item.kills != null) return `${item.kills}/${item.deaths ?? '?'}/${item.assists ?? '?'}`
  return item.result?.toUpperCase() ?? '—'
}
</script>

<template>
  <div v-if="cards.length" class="grid grid-cols-3 gap-3 flex-shrink-0">
    <button
      v-for="item in cards"
      :key="item.id"
      type="button"
      class="relative overflow-hidden rounded-xl border border-white/[0.10] min-h-[140px] text-left transition-all hover:border-white/[0.18] hover:-translate-y-0.5"
      @click="emit('open', item)"
    >
      <img
        v-if="gameFor(item) === 'valorant' && item.map && getMapImage(item.map)"
        :src="getMapImage(item.map)"
        alt=""
        class="absolute inset-0 w-full h-full object-cover opacity-40 scale-105"
      />
      <div
        v-else
        class="absolute inset-0 opacity-30"
        :style="{ background: `linear-gradient(135deg, ${gameBrand(gameFor(item)).accent}33, #0a0a0a)` }"
      />
      <div class="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-[#0a0a0a]/50" />

      <div class="relative z-10 p-3 flex flex-col h-full">
        <div class="flex items-start justify-between gap-2">
          <span
            class="text-[8px] font-black px-1.5 py-0.5 rounded border"
            :style="{
              color: gameBrand(gameFor(item)).accent,
              borderColor: `${gameBrand(gameFor(item)).accent}44`,
              background: `${gameBrand(gameFor(item)).accent}15`,
            }"
          >{{ gameBrand(gameFor(item)).wordmark }}</span>
          <span
            v-if="item.result"
            class="text-[8px] font-black uppercase px-1.5 py-0.5 rounded"
            :class="item.result === 'win' ? 'bg-emerald-500/15 text-emerald-400' : item.result === 'loss' ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-gray-400'"
          >{{ item.result }}</span>
        </div>

        <div class="mt-auto">
          <p class="text-[10px] text-gray-500 uppercase tracking-wide">Map · {{ item.map || 'Unknown' }}</p>
          <p class="text-lg font-black text-white tabular-nums leading-none mt-0.5">{{ scoreLine(item) }}</p>
          <div class="flex items-center gap-2 mt-2">
            <span
              class="flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-black border border-white/[0.08]"
              :style="{
                background: `${squadMemberColor(memberIndex(item.user_id))}22`,
                color: squadMemberColor(memberIndex(item.user_id)),
              }"
            >{{ squadMemberInitials(memberName(item.user_id)) }}</span>
            <div class="min-w-0">
              <p class="text-[11px] font-semibold text-white truncate">{{ memberName(item.user_id) }}</p>
              <p class="text-[10px] text-gray-500 truncate">
                {{ item.agent || '—' }}<span v-if="item.created_at"> · {{ squadTimeAgo(item.created_at) }}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </button>
  </div>
</template>
