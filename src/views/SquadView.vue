<template>
  <div class="px-3 py-3 space-y-3">

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-7 h-7 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- Error loading squad -->
    <template v-else-if="squadError">
      <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-10 flex flex-col items-center text-center gap-4">
        <div class="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
          <svg class="w-7 h-7 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h2 class="text-white font-bold text-base">Couldn't Load Squad</h2>
          <p class="text-gray-500 text-xs mt-1 max-w-[240px]">{{ squadError }}</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="flex items-center gap-1.5 px-4 py-2 bg-white/[0.04] border border-white/[0.08] text-gray-300 text-xs font-semibold rounded-lg hover:bg-white/[0.08] transition-colors"
            @click="load"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </button>
          <button
            class="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 border border-red-500/25 text-red-400 text-xs font-semibold rounded-lg hover:bg-red-500/20 transition-colors"
            @click="openWebTeam"
          >
            Open on Website
          </button>
        </div>
      </div>
    </template>

    <!-- No squad -->
    <template v-else-if="!team">
      <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden relative">
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

      <!-- Header bar: name + online count + quota + website link -->
      <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
            <svg class="w-4.5 h-4.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-white text-sm font-bold truncate">{{ team.name }}</p>
              <span v-if="team.plan" class="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded"
                :class="team.plan === 'pro' ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' : 'bg-white/[0.06] text-gray-400 border border-white/[0.08]'">
                {{ team.plan === 'pro' ? 'PRO' : 'FREE' }}
              </span>
            </div>
            <div class="flex items-center gap-3 mt-0.5">
              <p class="text-gray-600 text-xs">
                <span :class="onlineMembers > 0 ? 'text-green-500' : 'text-gray-600'">{{ onlineMembers }}</span>
                <span class="text-gray-700"> / {{ team.members.length }}</span>
                <span class="text-gray-600"> online</span>
              </p>
              <!-- Member slot quota -->
              <div v-if="team.max_members" class="flex items-center gap-1">
                <div class="flex gap-0.5">
                  <div
                    v-for="i in team.max_members"
                    :key="i"
                    class="w-2 h-2 rounded-sm"
                    :class="i <= team.members.length ? 'bg-red-500/70' : 'bg-white/[0.06]'"
                  />
                </div>
                <span class="text-gray-700 text-[10px]">{{ team.members.length }}/{{ team.max_members }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <!-- Refresh indicator -->
          <button
            class="w-7 h-7 flex items-center justify-center text-gray-600 hover:text-gray-300 rounded-lg hover:bg-white/[0.04] transition-colors"
            :class="{ 'animate-spin': refreshing }"
            title="Refresh"
            @click="refresh"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            class="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-white border border-white/[0.06] hover:border-white/[0.12] rounded-lg transition-colors"
            @click="openWebTeam"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Website
          </button>
        </div>
      </div>

      <!-- Member presence grid — sorted: recording > online > offline -->
      <div class="grid gap-2" :class="sortedMembers.length <= 2 ? 'grid-cols-2' : sortedMembers.length <= 4 ? 'grid-cols-2' : 'grid-cols-3'">
        <div
          v-for="(member, idx) in sortedMembers"
          :key="member.id"
          class="rounded-xl border px-3 py-2.5 transition-colors"
          :class="getPresence(member.id).is_recording
            ? 'bg-red-500/[0.06] border-red-500/20'
            : getPresence(member.id).online
              ? 'bg-green-500/[0.04] border-green-500/15'
              : 'bg-white/[0.02] border-white/[0.05]'"
        >
          <div class="flex items-center gap-2.5">
            <!-- Avatar + status dot -->
            <div class="relative flex-shrink-0">
              <div
                class="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold border border-white/[0.06]"
                :style="{ background: `linear-gradient(135deg, ${memberColor(originalIdx(member.id))}33, ${memberColor(originalIdx(member.id))}18)`, color: memberColor(originalIdx(member.id)) }"
              >{{ initials(member.name) }}</div>
              <div
                class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d1117]"
                :class="getPresence(member.id).is_recording ? 'bg-red-500' : getPresence(member.id).online ? 'bg-green-500' : 'bg-gray-700'"
              >
                <div v-if="getPresence(member.id).is_recording" class="w-full h-full rounded-full bg-red-400 animate-ping opacity-75" />
              </div>
            </div>
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="text-white text-xs font-semibold truncate leading-tight">{{ member.name }}</p>
              <p v-if="member.riot_name" class="text-[11px] text-gray-600 truncate leading-tight">
                {{ member.riot_name }}<span class="text-gray-700">#{{ member.riot_tag }}</span>
              </p>
              <div class="flex items-center gap-1 mt-0.5">
                <span
                  class="text-[11px] font-medium leading-tight"
                  :class="getPresence(member.id).is_recording ? 'text-red-400' : getPresence(member.id).online ? 'text-green-400' : 'text-gray-600'"
                >
                  {{ getPresence(member.id).is_recording ? '● Recording' : getPresence(member.id).online ? '● Online' : '○ Offline' }}
                </span>
                <span v-if="getPresence(member.id).game && getPresence(member.id).is_recording" class="text-[11px] text-gray-600 truncate">
                  · {{ getPresence(member.id).game }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Two-column lower section: Activity + My Recent Clips -->
      <div class="grid grid-cols-2 gap-3">

        <!-- Recent Squad Activity -->
        <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden flex flex-col">
          <div class="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
            <p class="text-xs font-bold text-white">Squad Activity</p>
            <button class="text-[11px] text-gray-500 hover:text-red-400 transition-colors" @click="openWebTeam">All →</button>
          </div>
          <div v-if="activity.length > 0" class="divide-y divide-white/[0.04] flex-1">
            <div
              v-for="item in activity.slice(0, 7)"
              :key="item.id"
              class="px-3 py-2 flex items-center gap-2"
            >
              <div
                class="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 border border-white/[0.06]"
                :style="{ background: `linear-gradient(135deg, ${memberColor(getMemberIdx(item.user_id))}33, ${memberColor(getMemberIdx(item.user_id))}18)`, color: memberColor(getMemberIdx(item.user_id)) }"
              >{{ initials(getMemberName(item.user_id)) }}</div>
              <div class="flex-1 min-w-0">
                <p class="text-white text-[11px] font-semibold truncate leading-tight">{{ getMemberName(item.user_id) }}</p>
                <p class="text-gray-600 text-[11px] truncate leading-tight">
                  {{ item.map ?? '—' }}<span v-if="item.agent"> · {{ item.agent }}</span>
                </p>
              </div>
              <div class="flex flex-col items-end gap-0.5 flex-shrink-0">
                <span
                  class="px-1.5 py-0.5 text-[10px] font-bold rounded"
                  :class="item.result === 'win' ? 'bg-green-500/15 text-green-400' : item.result === 'loss' ? 'bg-red-500/15 text-red-400' : 'bg-gray-500/15 text-gray-400'"
                >{{ item.result?.toUpperCase() ?? 'N/A' }}</span>
                <span v-if="item.kills != null" class="text-[10px] text-gray-600">
                  {{ item.kills }}/{{ item.deaths ?? '?' }}/{{ item.assists ?? '?' }}
                </span>
                <span v-if="item.created_at" class="text-[10px] text-gray-700">{{ timeAgo(item.created_at) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center gap-2">
            <svg class="w-7 h-7 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p class="text-gray-600 text-[11px] leading-relaxed">No activity yet.<br>Play some games!</p>
          </div>
        </div>

        <!-- My Recent Analyses -->
        <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden flex flex-col">
          <div class="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
            <p class="text-xs font-bold text-white">My Analyses</p>
            <span class="text-[11px] text-gray-600">Recent</span>
          </div>
          <div v-if="recentAnalyses.length > 0" class="divide-y divide-white/[0.04] flex-1">
            <div
              v-for="analysis in recentAnalyses.slice(0, 7)"
              :key="analysis.id"
              class="px-3 py-2 flex items-center gap-2"
            >
              <div class="w-6 h-6 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg class="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-white text-[11px] font-semibold truncate leading-tight">{{ analysis.map ?? 'Unknown Map' }}</p>
                <p class="text-gray-600 text-[11px] truncate leading-tight">
                  {{ analysis.agent ?? '—' }}<span v-if="analysis.game_mode"> · {{ analysis.game_mode }}</span>
                </p>
              </div>
              <div class="flex flex-col items-end gap-0.5 flex-shrink-0">
                <span v-if="analysis.overall_score != null"
                  class="px-1.5 py-0.5 text-[10px] font-bold rounded"
                  :class="analysis.overall_score >= 70 ? 'bg-green-500/15 text-green-400' : analysis.overall_score >= 45 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-red-500/15 text-red-400'"
                >{{ analysis.overall_score }}</span>
                <span v-else-if="analysis.won != null"
                  class="px-1.5 py-0.5 text-[10px] font-bold rounded"
                  :class="analysis.won ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'"
                >{{ analysis.won ? 'WIN' : 'LOSS' }}</span>
                <span v-if="analysis.kills != null" class="text-[10px] text-gray-600">
                  {{ analysis.kills }}/{{ analysis.deaths ?? '?' }}/{{ analysis.assists ?? '?' }}
                </span>
                <span v-if="analysis.created_at" class="text-[10px] text-gray-700">{{ timeAgo(analysis.created_at) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center gap-2">
            <svg class="w-7 h-7 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p class="text-gray-600 text-[11px] leading-relaxed">No analyses yet.<br>Submit a VOD to get started.</p>
          </div>
        </div>

      </div>

      <!-- My Recent Clips row -->
      <div v-if="recentClips.length > 0" class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div class="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
          <p class="text-xs font-bold text-white">My Recent Clips</p>
          <span class="text-[11px] text-gray-600">{{ recentClips.length }} clip{{ recentClips.length === 1 ? '' : 's' }}</span>
        </div>
        <div class="flex gap-2 p-2.5 overflow-x-auto scrollbar-hide">
          <div
            v-for="clip in recentClips"
            :key="clip.id"
            class="flex-shrink-0 w-28 rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden"
          >
            <div class="relative w-28 h-16 bg-black/40 flex items-center justify-center overflow-hidden">
              <img v-if="clip.thumbPath" :src="`file://${clip.thumbPath}`" class="w-full h-full object-cover opacity-80" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <!-- Trigger badge -->
              <span
                class="absolute top-1 left-1 px-1 py-0.5 text-[9px] font-bold rounded uppercase"
                :class="clipTriggerClass(clip.trigger)"
              >{{ clipTriggerLabel(clip.trigger) }}</span>
            </div>
            <div class="px-1.5 py-1">
              <p class="text-[10px] text-gray-400 truncate">{{ clip.map ?? clip.trigger }}</p>
              <p class="text-[10px] text-gray-600 truncate">{{ clip.durationSeconds ? `${Math.round(clip.durationSeconds)}s` : '' }}</p>
            </div>
          </div>
        </div>
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
  plan?: string
  max_members?: number
  members: TeamMember[]
}

interface PresenceEntry {
  online: boolean
  is_recording: boolean
  game?: string | null
}

interface ActivityItem {
  id: number
  user_id: number
  map?: string
  agent?: string
  result?: string
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  score?: number | null
  created_at?: string
}

interface AnalysisItem {
  id: number
  map?: string | null
  agent?: string | null
  game_mode?: string | null
  won?: boolean | null
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  overall_score?: number | null
  created_at: string
}

interface ClipItem {
  id: string
  trigger: string
  map?: string | null
  thumbPath?: string | null
  durationSeconds?: number | null
  createdAt?: number
}

const team = ref<Team | null>(null)
const loading = ref(true)
const refreshing = ref(false)
const squadError = ref<string | null>(null)
const presence = ref<Record<number, PresenceEntry>>({})
const activity = ref<ActivityItem[]>([])
const recentAnalyses = ref<AnalysisItem[]>([])
const recentClips = ref<ClipItem[]>([])

let pollTimer: ReturnType<typeof setInterval> | null = null

const MEMBER_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#ec4899', '#a855f7']
function memberColor(idx: number) { return MEMBER_COLORS[idx % MEMBER_COLORS.length] }
function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? '?' }

const onlineMembers = computed(() =>
  team.value?.members.filter(m => presence.value[m.id]?.online || presence.value[m.id]?.is_recording).length ?? 0
)

/** Members sorted: recording → online → offline */
const sortedMembers = computed(() => {
  if (!team.value) return []
  return [...team.value.members].sort((a, b) => {
    const pa = presence.value[a.id]
    const pb = presence.value[b.id]
    const rankA = pa?.is_recording ? 2 : pa?.online ? 1 : 0
    const rankB = pb?.is_recording ? 2 : pb?.online ? 1 : 0
    return rankB - rankA
  })
})

function originalIdx(userId: number): number {
  return team.value?.members.findIndex(m => m.id === userId) ?? 0
}

function getPresence(userId: number): PresenceEntry {
  return presence.value[userId] ?? { online: false, is_recording: false, game: null }
}

function getMemberIdx(userId: number) {
  return team.value?.members.findIndex(m => m.id === userId) ?? 0
}

function getMemberName(userId: number) {
  return team.value?.members.find(m => m.id === userId)?.name ?? 'Unknown'
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function clipTriggerLabel(trigger: string): string {
  const map: Record<string, string> = { ace: 'ACE', clutch: 'CLCH', multikill: '3K+', kill: 'KILL', hotkey: 'CLIP' }
  return map[trigger] ?? trigger.slice(0, 4).toUpperCase()
}

function clipTriggerClass(trigger: string): string {
  if (trigger === 'ace') return 'bg-yellow-500/20 text-yellow-300'
  if (trigger === 'clutch') return 'bg-purple-500/20 text-purple-300'
  if (trigger === 'multikill') return 'bg-orange-500/20 text-orange-300'
  return 'bg-white/10 text-gray-300'
}

async function load() {
  loading.value = true
  squadError.value = null
  try {
    // Sync accurate presence first so we appear online immediately
    window.api.squad.syncPresence().catch(() => {})

    const [result, analyses, clipsResult] = await Promise.all([
      window.api.squad.getTeam(),
      window.api.analyses.get(7).catch(() => []),
      window.api.clips.get().catch(() => []),
    ])

    if (result?.error && !result.team) {
      squadError.value = result.error
      team.value = null
    } else {
      team.value = (result?.team as Team) ?? null
      activity.value = (result?.activity as ActivityItem[]) ?? []
      if (result?.presence) presence.value = result.presence as Record<number, PresenceEntry>
    }

    recentAnalyses.value = (analyses as AnalysisItem[]) ?? []
    // Most recent 6 clips that have a path
    const allClips = (Array.isArray(clipsResult) ? clipsResult : []) as ClipItem[]
    recentClips.value = allClips
      .filter(c => c.thumbPath || c.id)
      .slice(0, 6)
  } catch {
    squadError.value = 'Failed to connect to UpForge servers'
    team.value = null
  } finally {
    loading.value = false
  }
}

async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    // Sync our own presence first so teammates see accurate status
    window.api.squad.syncPresence().catch(() => {})
    const result = await window.api.squad.getTeam()
    if (result?.presence) presence.value = result.presence as Record<number, PresenceEntry>
    if (result?.activity) activity.value = result.activity as ActivityItem[]
    if (result?.team) team.value = result.team as Team
  } catch { /* ignore */ } finally {
    refreshing.value = false
  }
}

function openWebTeam() {
  window.open('https://upforge.gg/team', '_blank')
}

onMounted(() => {
  load()
  // Poll every 30s: refresh presence AND send heartbeat so we stay "online"
  pollTimer = setInterval(() => {
    window.api.squad.syncPresence().catch(() => {})
    refresh()
  }, 30000)
})

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer)
  // Mark ourselves offline when leaving the app / this view
  window.api.squad.sendPresence(false, null).catch(() => {})
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
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>

