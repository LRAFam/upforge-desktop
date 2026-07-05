<script setup lang="ts">
import { gameBrand } from '../../lib/game-branding'
import {
  squadMemberColor,
  squadMemberInitials,
  squadGamePillLabel,
  normalizePresenceGame,
} from '../../lib/squad-ui'
import type { SquadLineupMember, SquadPresenceEntry } from './SquadLineupRow.vue'

defineProps<{
  members: Array<{ member: SquadLineupMember; presence: SquadPresenceEntry }>
  memberIndex: (userId: number) => number
}>()

const emit = defineEmits<{ select: [member: SquadLineupMember] }>()
</script>

<template>
  <div v-if="members.length" class="space-y-2">
    <p class="text-[10px] font-black uppercase tracking-[0.18em] text-red-400/80 px-0.5">Live capture</p>
    <div class="grid gap-2" :class="members.length === 1 ? 'grid-cols-1' : 'grid-cols-2'">
      <button
        v-for="{ member, presence } in members"
        :key="member.id"
        type="button"
        class="dash-panel relative overflow-hidden p-3 text-left border-red-500/30 hover:border-red-500/45 transition-colors"
        @click="emit('select', member)"
      >
        <div class="absolute inset-0 bg-red-500/[0.04] pointer-events-none" />
        <div class="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
        <div class="relative flex items-center gap-3">
          <div class="relative flex-shrink-0">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/25 text-sm font-black"
              :style="{
                background: `linear-gradient(135deg, ${squadMemberColor(memberIndex(member.id))}40, rgba(15,23,42,0.88))`,
                color: squadMemberColor(memberIndex(member.id)),
              }"
            >{{ squadMemberInitials(member.name) }}</div>
            <span class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[12px] font-bold text-white truncate">{{ member.name }}</p>
            <p class="text-[10px] text-red-400 font-semibold uppercase tracking-wide mt-0.5">Recording now</p>
            <span
              v-if="normalizePresenceGame(presence.game ?? null)"
              class="inline-block mt-1 text-[8px] font-black px-1.5 py-0.5 rounded border"
              :style="{
                color: gameBrand(normalizePresenceGame(presence.game!)!).accent,
                borderColor: `${gameBrand(normalizePresenceGame(presence.game!)!).accent}44`,
              }"
            >{{ squadGamePillLabel(normalizePresenceGame(presence.game!)!) }}</span>
          </div>
          <div class="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        </div>
      </button>
    </div>
  </div>
</template>
