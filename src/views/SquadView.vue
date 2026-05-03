<template>
  <div class="px-3 py-3 space-y-3">

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-7 h-7 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- No squad -->
    <template v-else-if="!team">
      <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden relative">
        <!-- Orb bg -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
          <div class="squad-orb squad-orb-1" />
          <div class="squad-orb squad-orb-2" />
        </div>
        <div class="relative px-5 py-10 flex flex-col items-center text-center gap-4">
          <div class="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg class="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 class="text-white font-bold text-base">No Squad Yet</h2>
            <p class="text-gray-500 text-xs mt-1 max-w-[240px]">Create or join a squad on the UpForge website to see your team's presence and stats here.</p>
          </div>
          <button
            class="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-semibold rounded-lg hover:bg-red-500/20 transition-colors"
            @click="openWebTeam"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open on Website
          </button>
        </div>
      </div>
    </template>

    <!-- Squad exists -->
    <template v-else>
      <!-- Header -->
      <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div class="min-w-0">
            <p class="text-white text-sm font-bold truncate">{{ team.name }}</p>
            <p class="text-gray-600 text-[10px]">{{ onlineMembers }} / {{ team.members.length }} online</p>
          </div>
        </div>
        <button
          class="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-semibold text-gray-400 hover:text-white border border-white/[0.06] hover:border-white/[0.12] rounded-lg transition-colors"
          @click="openWebTeam"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Website
        </button>
      </div>

      <!-- Member presence grid -->
      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="(member, idx) in team.members"
          :key="member.id"
          class="rounded-xl border px-3 py-2.5 flex items-center gap-2.5 transition-colors"
          :class="getPresence(member.id).is_recording
            ? 'bg-red-500/[0.06] border-red-500/20'
            : getPresence(member.id).online
              ? 'bg-green-500/[0.04] border-green-500/15'
              : 'bg-white/[0.02] border-white/[0.05]'"
        >
          <!-- Avatar + indicator -->
          <div class="relative flex-shrink-0">
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
              :style="{ background: memberColor(idx) + '22', color: memberColor(idx) }"
            >{{ initials(member.name) }}</div>
            <div
              class="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0d1117]"
              :class="getPresence(member.id).is_recording ? 'bg-red-500 animate-pulse' : getPresence(member.id).online ? 'bg-green-500' : 'bg-gray-700'"
            />
          </div>
          <!-- Info -->
          <div class="flex-1 min-w-0">
            <p class="text-white text-xs font-semibold truncate">{{ member.name }}</p>
            <p class="text-[10px] truncate" :class="getPresence(member.id).is_recording ? 'text-red-400' : getPresence(member.id).online ? 'text-green-500' : 'text-gray-600'">
              {{ getPresence(member.id).is_recording ? 'Recording' : getPresence(member.id).online ? 'Online' : 'Offline' }}
            </p>
          </div>
        </div>
      </div>

      <!-- Recent activity -->
      <div v-if="activity.length > 0" class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div class="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
          <p class="text-xs font-bold text-white">Recent Activity</p>
          <button class="text-[10px] text-gray-500 hover:text-red-400 transition-colors" @click="openWebTeam">View all →</button>
        </div>
        <div class="divide-y divide-white/[0.04]">
          <div
            v-for="item in activity.slice(0, 6)"
            :key="item.id"
            class="px-4 py-2.5 flex items-center gap-2.5"
          >
            <div
              class="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              :style="{ background: memberColor(getMemberIdx(item.user_id)) + '22', color: memberColor(getMemberIdx(item.user_id)) }"
            >{{ initials(getMemberName(item.user_id)) }}</div>
            <div class="flex-1 min-w-0">
              <p class="text-white text-[11px] font-semibold truncate">{{ getMemberName(item.user_id) }}</p>
              <p class="text-gray-600 text-[10px] truncate">{{ item.map }} · {{ item.agent }}</p>
            </div>
            <span
              class="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded"
              :class="item.result === 'win' ? 'bg-green-500/15 text-green-400' : item.result === 'loss' ? 'bg-red-500/15 text-red-400' : 'bg-gray-500/15 text-gray-400'"
            >{{ item.result?.toUpperCase() ?? 'N/A' }}</span>
          </div>
        </div>
      </div>

      <!-- Empty activity -->
      <div v-else class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center">
        <p class="text-gray-500 text-xs">No squad activity yet. Play some games!</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
interface TeamMember {
  id: number
  name: string
  riot_name?: string
  riot_tag?: string
}

interface Team {
  name: string
  members: TeamMember[]
}

interface PresenceEntry {
  online: boolean
  is_recording: boolean
}

interface ActivityItem {
  id: number
  user_id: number
  map?: string
  agent?: string
  result?: string
}

const team = ref<Team | null>(null)
const loading = ref(true)
const presence = ref<Record<number, PresenceEntry>>({})
const activity = ref<ActivityItem[]>([])

let presenceInterval: ReturnType<typeof setInterval> | null = null

const MEMBER_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#ec4899', '#a855f7']
function memberColor(idx: number) { return MEMBER_COLORS[idx % MEMBER_COLORS.length] }
function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? '?' }

const onlineMembers = computed(() =>
  team.value?.members.filter(m => presence.value[m.id]?.online || presence.value[m.id]?.is_recording).length ?? 0
)

function getPresence(userId: number): PresenceEntry {
  return presence.value[userId] ?? { online: false, is_recording: false }
}

function getMemberIdx(userId: number) {
  return team.value?.members.findIndex(m => m.id === userId) ?? 0
}

function getMemberName(userId: number) {
  return team.value?.members.find(m => m.id === userId)?.name ?? 'Unknown'
}

async function load() {
  loading.value = true
  try {
    const result = await window.api.squad.getTeam()
    team.value = result?.team ?? null
    activity.value = result?.activity ?? []
    if (result?.presence) {
      presence.value = result.presence
    }
  } catch {
    team.value = null
  } finally {
    loading.value = false
  }
}

async function refreshPresence() {
  if (!team.value) return
  try {
    const result = await window.api.squad.getTeam()
    if (result?.presence) presence.value = result.presence
  } catch { /* ignore */ }
}

function openWebTeam() {
  window.open('https://upforge.gg/team', '_blank')
}

onMounted(() => {
  load()
  presenceInterval = setInterval(refreshPresence, 30000)
})

onUnmounted(() => {
  if (presenceInterval) clearInterval(presenceInterval)
})
</script>

<style scoped>
.squad-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(50px);
  opacity: 0.12;
  animation: squadDrift 10s ease-in-out infinite;
  pointer-events: none;
}
.squad-orb-1 {
  width: 220px;
  height: 220px;
  background: #ef4444;
  top: -60px;
  left: -60px;
  animation-delay: 0s;
}
.squad-orb-2 {
  width: 180px;
  height: 180px;
  background: #a855f7;
  bottom: -40px;
  right: -40px;
  animation-delay: -5s;
}
@keyframes squadDrift {
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(15px, 10px); }
}
</style>
