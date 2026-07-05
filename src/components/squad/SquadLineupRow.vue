<script setup lang="ts">
import { computed } from 'vue'
import { gameBrand } from '../../lib/game-branding'
import {
  squadMemberColor,
  squadMemberInitials,
  squadMemberStatus,
  squadStatusLabel,
  squadGamePillLabel,
  normalizePresenceGame,
  type SquadMemberStatus,
} from '../../lib/squad-ui'
import type { PrimaryGame } from '../../lib/games'

export interface SquadLineupMember {
  id: number
  name: string
  riot_name?: string
  riot_tag?: string
  rank?: string | null
  competitive_rank?: string | null
}

export interface SquadPresenceEntry {
  online: boolean
  is_recording: boolean
  game?: string | null
}

const props = defineProps<{
  members: SquadLineupMember[]
  maxSlots: number
  presence: Record<number, SquadPresenceEntry>
  memberIndex: (userId: number) => number
  selectedId?: number | null
}>()

const emit = defineEmits<{ invite: []; select: [member: SquadLineupMember] }>()

type Slot =
  | { kind: 'member'; member: SquadLineupMember }
  | { kind: 'empty' }

const slots = computed<Slot[]>(() => {
  const filled: Slot[] = props.members.map(member => ({ kind: 'member', member }))
  while (filled.length < props.maxSlots) filled.push({ kind: 'empty' })
  return filled.slice(0, props.maxSlots)
})

function statusFor(userId: number): SquadMemberStatus {
  return squadMemberStatus(props.presence[userId])
}

function gameFor(userId: number): PrimaryGame | null {
  return normalizePresenceGame(props.presence[userId]?.game ?? null)
}

function rankLabel(member: SquadLineupMember): string | null {
  return member.rank ?? member.competitive_rank ?? null
}

function slotBorderClass(status: SquadMemberStatus): string {
  if (status === 'recording') return 'border-red-500/45 shadow-[0_0_24px_rgba(239,68,68,0.18)]'
  if (status === 'online') return 'border-emerald-500/30'
  return 'border-white/[0.09]'
}

function statusDotClass(status: SquadMemberStatus): string {
  if (status === 'recording') return 'bg-red-500'
  if (status === 'online') return 'bg-emerald-500'
  return 'bg-gray-600'
}
</script>

<template>
  <div class="dash-panel p-4">
    <div class="flex items-center justify-between gap-3 mb-3">
      <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Squad lineup</p>
      <p class="text-[10px] text-gray-600">{{ members.length }} / {{ maxSlots }} rostered</p>
    </div>

    <div
      class="grid gap-2"
      :class="maxSlots <= 4 ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-6'"
    >
      <div
        v-for="(slot, i) in slots"
        :key="slot.kind === 'member' ? slot.member.id : `empty-${i}`"
        class="relative rounded-xl border bg-white/[0.02] p-2.5 min-h-[118px] flex flex-col items-center text-center transition-all"
        :class="[
          slot.kind === 'member' ? slotBorderClass(statusFor(slot.member.id)) : 'border-dashed border-white/[0.12]',
          slot.kind === 'member' && selectedId === slot.member.id ? 'ring-1 ring-red-500/40 bg-red-500/[0.04]' : '',
        ]"
      >
        <button
          v-if="slot.kind === 'empty'"
          type="button"
          class="flex flex-col items-center justify-center flex-1 w-full gap-1.5 text-gray-600 hover:text-red-400 transition-colors"
          @click="emit('invite')"
        >
          <span class="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.10] bg-black/20 text-lg">+</span>
          <span class="text-[10px] font-semibold">Invite</span>
        </button>

        <button
          v-else
          type="button"
          class="flex flex-col items-center flex-1 w-full"
          @click="emit('select', slot.member)"
        >
          <div class="relative mb-2">
            <span
              v-if="statusFor(slot.member.id) === 'recording'"
              class="absolute inset-0 rounded-xl border-2 border-red-500/50 animate-pulse pointer-events-none"
            />
            <div
              class="relative flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] text-sm font-black"
              :style="{
                background: `linear-gradient(135deg, ${squadMemberColor(memberIndex(slot.member.id))}40, rgba(15,23,42,0.88))`,
                color: squadMemberColor(memberIndex(slot.member.id)),
              }"
            >{{ squadMemberInitials(slot.member.name) }}</div>
            <span
              class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0a0a0a]"
              :class="statusDotClass(statusFor(slot.member.id))"
            />
          </div>

          <p class="text-[11px] font-bold text-white truncate w-full leading-tight">{{ slot.member.name }}</p>
          <p v-if="slot.member.riot_name" class="text-[8px] text-gray-600 truncate w-full">{{ slot.member.riot_name }}</p>
          <p v-else-if="rankLabel(slot.member)" class="text-[9px] text-gray-500 truncate w-full mt-0.5">{{ rankLabel(slot.member) }}</p>

          <div class="mt-auto pt-2 flex flex-wrap items-center justify-center gap-1 w-full">
            <span
              v-if="gameFor(slot.member.id)"
              class="text-[8px] font-black px-1.5 py-0.5 rounded border"
              :style="{
                color: gameBrand(gameFor(slot.member.id)!).accent,
                borderColor: `${gameBrand(gameFor(slot.member.id)!).accent}44`,
                background: `${gameBrand(gameFor(slot.member.id)!).accent}12`,
              }"
            >{{ squadGamePillLabel(gameFor(slot.member.id)!) }}</span>
            <span
              class="text-[8px] font-bold uppercase tracking-wide"
              :class="statusFor(slot.member.id) === 'recording' ? 'text-red-400' : statusFor(slot.member.id) === 'online' ? 'text-emerald-400' : 'text-gray-600'"
            >{{ squadStatusLabel(statusFor(slot.member.id)) }}</span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>
