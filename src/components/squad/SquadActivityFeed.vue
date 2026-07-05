<script setup lang="ts">
import GameBrandIcon from '../dashboard/GameBrandIcon.vue'
import {
  inferActivityGame,
  squadMemberColor,
  squadMemberInitials,
  squadTimeAgo,
} from '../../lib/squad-ui'
import type { SquadActivityItem } from './SquadActivityCards.vue'

defineProps<{
  items: SquadActivityItem[]
  memberName: (userId: number) => string
  memberIndex: (userId: number) => number
}>()

const emit = defineEmits<{ open: [item: SquadActivityItem]; viewAll: [] }>()
</script>

<template>
  <div class="dash-panel overflow-hidden flex flex-col min-h-0 flex-1">
    <div class="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08] flex-shrink-0">
      <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Squad activity</p>
      <button type="button" class="text-[11px] font-semibold text-gray-500 hover:text-red-400" @click="emit('viewAll')">All →</button>
    </div>

    <div v-if="items.length" class="divide-y divide-white/[0.05] overflow-y-auto scroll-col flex-1">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-white/[0.03] transition-colors"
        @click="emit('open', item)"
      >
        <span
          class="flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black border border-white/[0.08] flex-shrink-0"
          :style="{
            background: `${squadMemberColor(memberIndex(item.user_id))}22`,
            color: squadMemberColor(memberIndex(item.user_id)),
          }"
        >{{ squadMemberInitials(memberName(item.user_id)) }}</span>

        <div class="flex-1 min-w-0">
          <p class="text-[12px] font-semibold text-white truncate">{{ memberName(item.user_id) }}</p>
          <p class="text-[11px] text-gray-500 truncate">
            {{ item.map ?? '—' }}<span v-if="item.agent"> · {{ item.agent }}</span>
          </p>
        </div>

        <div class="flex items-center gap-2 flex-shrink-0">
          <GameBrandIcon :game="inferActivityGame(item)" :active="true" size="sm" />
          <div class="text-right">
            <span
              v-if="item.result"
              class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded"
              :class="item.result === 'win' ? 'bg-emerald-500/15 text-emerald-400' : item.result === 'loss' ? 'bg-red-500/15 text-red-400' : 'bg-white/10 text-gray-400'"
            >{{ item.result }}</span>
            <p v-if="item.created_at" class="text-[10px] text-gray-600 mt-0.5">{{ squadTimeAgo(item.created_at) }}</p>
          </div>
        </div>
      </button>
    </div>

    <div v-else class="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
      <p class="text-sm font-semibold text-gray-400">No squad activity yet</p>
      <p class="text-[11px] text-gray-600 mt-1">When teammates analyse matches, they show up here.</p>
    </div>
  </div>
</template>
