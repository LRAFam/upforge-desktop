<script setup lang="ts">
import {
  squadMemberColor,
  squadMemberInitials,
  squadMemberStatus,
  squadStatusLabel,
  normalizePresenceGame,
  squadGamePillLabel,
} from '../../lib/squad-ui'
import { gameBrand } from '../../lib/game-branding'
import type { SquadLineupMember, SquadPresenceEntry } from './SquadLineupRow.vue'

export interface SquadMemberStat {
  user_id: number
  name: string
  current_rank?: string | null
  rr?: number | null
  kd_ratio?: number | null
  win_rate?: number | null
  headshot_percentage?: number | null
  most_played_agent?: string | null
  has_stats?: boolean
}

const props = defineProps<{
  member: SquadLineupMember
  memberIndex: number
  presence: SquadPresenceEntry | undefined
  stats: SquadMemberStat | null
}>()

const emit = defineEmits<{ close: [] }>()

const status = squadMemberStatus(props.presence)
</script>

<template>
  <div class="dash-panel p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] text-base font-black flex-shrink-0"
          :style="{
            background: `linear-gradient(135deg, ${squadMemberColor(memberIndex)}40, rgba(15,23,42,0.88))`,
            color: squadMemberColor(memberIndex),
          }"
        >{{ squadMemberInitials(member.name) }}</div>
        <div class="min-w-0">
          <p class="text-sm font-black text-white truncate">{{ member.name }}</p>
          <p v-if="member.riot_name" class="text-[11px] text-gray-500 truncate">
            {{ member.riot_name }}<span class="text-gray-600">#{{ member.riot_tag }}</span>
          </p>
          <div class="flex flex-wrap items-center gap-1.5 mt-1">
            <span
              class="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border"
              :class="status === 'recording' ? 'border-red-500/25 bg-red-500/10 text-red-300' : status === 'online' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-white/[0.08] text-gray-500'"
            >{{ squadStatusLabel(status) }}</span>
            <span
              v-if="normalizePresenceGame(presence?.game ?? null)"
              class="text-[9px] font-black px-1.5 py-0.5 rounded border"
              :style="{
                color: gameBrand(normalizePresenceGame(presence?.game ?? null)!).accent,
                borderColor: `${gameBrand(normalizePresenceGame(presence?.game ?? null)!).accent}44`,
              }"
            >{{ squadGamePillLabel(normalizePresenceGame(presence?.game ?? null)!) }}</span>
          </div>
        </div>
      </div>
      <button type="button" class="text-gray-600 hover:text-white p-1" @click="emit('close')">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12"/></svg>
      </button>
    </div>

    <div v-if="stats?.has_stats" class="grid grid-cols-4 gap-2 mt-4">
      <div class="rounded-lg border border-white/[0.08] bg-black/20 px-2 py-2 text-center">
        <p class="text-[9px] text-gray-600 uppercase">Rank</p>
        <p class="text-[11px] font-bold text-white mt-0.5 truncate">{{ stats.current_rank ?? '—' }}</p>
      </div>
      <div class="rounded-lg border border-white/[0.08] bg-black/20 px-2 py-2 text-center">
        <p class="text-[9px] text-gray-600 uppercase">Win %</p>
        <p class="text-[11px] font-bold text-white mt-0.5 tabular-nums">{{ stats.win_rate != null ? `${Math.round(stats.win_rate)}%` : '—' }}</p>
      </div>
      <div class="rounded-lg border border-white/[0.08] bg-black/20 px-2 py-2 text-center">
        <p class="text-[9px] text-gray-600 uppercase">K/D</p>
        <p class="text-[11px] font-bold text-white mt-0.5 tabular-nums">{{ stats.kd_ratio?.toFixed(2) ?? '—' }}</p>
      </div>
      <div class="rounded-lg border border-white/[0.08] bg-black/20 px-2 py-2 text-center">
        <p class="text-[9px] text-gray-600 uppercase">HS%</p>
        <p class="text-[11px] font-bold text-white mt-0.5 tabular-nums">{{ stats.headshot_percentage != null ? `${Math.round(stats.headshot_percentage)}%` : '—' }}</p>
      </div>
    </div>
    <p v-else-if="stats" class="mt-4 text-[11px] text-gray-600">No linked stats yet — connect Riot ID on the website.</p>
    <p v-if="stats?.most_played_agent" class="mt-3 text-[11px] text-gray-500">
      Most played: <span class="text-gray-300 font-semibold">{{ stats.most_played_agent }}</span>
    </p>
    <p v-if="status === 'recording'" class="mt-3 text-[11px] text-red-400/90">Capturing gameplay for the squad right now.</p>
  </div>
</template>
