<script setup lang="ts">
import { squadMemberColor, squadMemberInitials } from '../../lib/squad-ui'

defineProps<{
  entries: Array<{ user_id: number; name: string; analyses_count?: number }>
  memberIndex: (userId: number) => number
}>()
</script>

<template>
  <div v-if="entries.length" class="dash-panel p-4">
    <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500 mb-3">Squad contributions</p>
    <div class="space-y-2">
      <div
        v-for="(entry, i) in entries.slice(0, 5)"
        :key="entry.user_id"
        class="flex items-center gap-2.5"
      >
        <span
          class="w-5 text-center text-[10px] font-black tabular-nums flex-shrink-0"
          :class="i === 0 ? 'text-amber-300' : 'text-gray-600'"
        >{{ i + 1 }}</span>
        <span
          class="flex h-7 w-7 items-center justify-center rounded-lg text-[9px] font-black flex-shrink-0"
          :style="{
            background: `${squadMemberColor(memberIndex(entry.user_id))}22`,
            color: squadMemberColor(memberIndex(entry.user_id)),
          }"
        >{{ squadMemberInitials(entry.name) }}</span>
        <p class="flex-1 text-[11px] font-semibold text-white truncate">{{ entry.name }}</p>
        <span class="text-[11px] font-black tabular-nums text-gray-400">{{ entry.analyses_count ?? 0 }}</span>
      </div>
    </div>
    <p class="text-[10px] text-gray-600 mt-3">Total VOD analyses submitted</p>
  </div>
</template>
