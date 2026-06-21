<template>
  <div class="rounded-xl border border-white/[0.10] bg-white/[0.02] overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-white/[0.09]">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded-md flex items-center justify-center" style="background:rgba(20,184,166,0.15)">
          <svg class="w-3 h-3 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <span class="text-xs font-semibold text-gray-200">Deadlock Stats</span>
      </div>
      <div class="flex items-center gap-1">
        <button
          class="p-1 text-gray-700 hover:text-gray-400 transition-colors rounded"
          title="Refresh stats"
          @click="loadStats(true)"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </button>
        <button
          class="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all"
          style="background:rgba(20,184,166,0.12);color:#2dd4bf;border:1px solid rgba(20,184,166,0.2)"
          @click="openWeb"
        >
          View details →
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-3.5 py-4 flex items-center gap-2">
      <div class="w-3 h-3 rounded-full border border-teal-500/30 border-t-teal-400 animate-spin" />
      <span class="text-xs text-gray-600">Loading stats…</span>
    </div>

    <!-- Fetch error (linked but API failed) -->
    <div v-else-if="fetchError" class="px-3.5 py-4 flex items-center justify-between gap-3">
      <p class="text-xs text-amber-400/90 leading-relaxed">
        Couldn't load stats right now. Your Steam profile is linked — try refreshing.
      </p>
      <button
        class="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-all border border-amber-500/25 bg-amber-500/10 text-amber-300"
        @click="loadStats(true)"
      >
        Retry
      </button>
    </div>

    <!-- Not connected -->
    <div v-else-if="!linked" class="px-3.5 py-4 flex items-center justify-between gap-3">
      <p class="text-xs text-gray-500 leading-relaxed">
        Stats sync from your linked Steam profile (match history on deadlock-api.com). Link once on the web — search by your <strong class="text-gray-400 font-semibold">Steam display name</strong>.
      </p>
      <button
        class="flex-shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg transition-all"
        style="background:rgba(20,184,166,0.15);color:#2dd4bf;border:1px solid rgba(20,184,166,0.25)"
        @click="openConnectSteam"
      >
        Link Steam →
      </button>
    </div>

    <!-- Stats -->
    <div v-else class="divide-y divide-white/[0.03]">
      <!-- Rank + summary row -->
      <div class="flex items-center gap-3 px-3.5 py-3">
        <img
          v-if="rankIconUrl"
          :src="rankIconUrl"
          class="w-9 h-9 object-contain flex-shrink-0"
          alt="Rank"
        />
        <div
          v-else
          class="w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-teal-400 flex-shrink-0"
          style="background:rgba(20,184,166,0.1);border:1px solid rgba(20,184,166,0.15)"
        >
          {{ stats.current_rank?.name?.slice(0, 2) ?? '?' }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-black text-white">
            {{ stats.current_rank?.name ?? 'Unranked' }}
            <span v-if="stats.current_rank?.subtier != null" class="text-teal-400 ml-0.5">
              {{ stats.current_rank.subtier }}
            </span>
          </div>
          <div class="flex gap-3 text-[10px] text-gray-500 mt-0.5">
            <span>
              <span class="text-teal-400 font-semibold">{{ stats.summary.wins }}</span>W
              <span class="mx-0.5">·</span>
              <span class="text-red-400 font-semibold">{{ stats.summary.losses }}</span>L
              <span class="mx-0.5">·</span>
              <span class="text-white font-semibold">{{ stats.summary.win_rate }}%</span> WR
            </span>
            <span>KDA <strong class="text-white">{{ stats.summary.avg_kda }}</strong></span>
          </div>
        </div>
      </div>

      <!-- Recent matches (last 5) -->
      <div v-if="stats.recent_matches.length" class="px-3.5 py-2">
        <p class="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">Recent</p>
        <div class="space-y-1">
          <div
            v-for="match in stats.recent_matches.slice(0, 5)"
            :key="match.match_id"
            class="flex items-center gap-2"
          >
            <span
              class="w-5 text-center text-[9px] font-bold rounded py-0.5 flex-shrink-0"
              :class="match.match_result === 1 ? 'bg-teal-500/20 text-teal-400' : 'bg-red-500/20 text-red-400'"
            >
              {{ match.match_result === 1 ? 'W' : 'L' }}
            </span>
            <div
              class="w-5 h-5 rounded flex-shrink-0 overflow-hidden flex items-center justify-center text-[9px] font-bold"
              :style="{ background: heroColor(match.hero_color) }"
            >
              <img v-if="match.hero_icon" :src="match.hero_icon" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-white/60">{{ heroInitials(match.hero_name) }}</span>
            </div>
            <span class="flex-1 text-[10px] text-gray-400 truncate">{{ match.hero_name }}</span>
            <span v-if="matchDate(match)" class="text-[9px] text-gray-600 flex-shrink-0 w-14 text-right">{{ matchDate(match) }}</span>
            <span class="text-[10px] font-mono text-gray-500 flex-shrink-0 w-12 text-right">
              {{ fmtNW(match.net_worth) }}
            </span>
            <span class="text-[10px] font-mono text-gray-600 flex-shrink-0 w-10 text-right">
              {{ fmtDuration(match.match_duration_s) }}
            </span>
            <span class="text-[10px] font-mono text-gray-500 flex-shrink-0 w-14 text-right">
              {{ match.player_kills }}/{{ match.player_deaths }}/{{ match.player_assists }}
            </span>
          </div>
        </div>
      </div>

      <!-- Top heroes -->
      <div v-if="stats.hero_stats.length" class="px-3.5 py-2">
        <p class="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">Top Heroes</p>
        <div class="space-y-1.5">
          <div
            v-for="hero in stats.hero_stats.slice(0, 3)"
            :key="hero.hero_id"
            class="flex items-center gap-2"
          >
            <div
              class="w-5 h-5 rounded flex-shrink-0 overflow-hidden flex items-center justify-center text-[9px] font-bold"
              :style="{ background: heroColor(hero.hero_color) }"
            >
              <img v-if="hero.hero_icon" :src="hero.hero_icon" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-white/60">{{ heroInitials(hero.hero_name) }}</span>
            </div>
            <span class="flex-1 text-[10px] text-gray-300 truncate">{{ hero.hero_name }}</span>
            <span class="text-[10px] text-gray-600">{{ hero.matches_played }}G</span>
            <span class="text-[10px] font-semibold text-teal-400 w-8 text-right">{{ hero.win_rate }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { DeadlockProfileStats } from '../env.d.ts'
import { getDeadlockRankIconUrl } from '../lib/deadlock'
import { formatDeadlockMatchDate, fmtDeadlockDuration, fmtDeadlockNW } from '../lib/deadlock-analyses'

const loading = ref(true)
const stats = ref<DeadlockProfileStats | null>(null)
const linked = ref(false)
const fetchError = ref(false)

const rankIconUrl = computed(() => {
  const rank = stats.value?.current_rank
  if (!rank) return getDeadlockRankIconUrl('Obscurus')
  return getDeadlockRankIconUrl(rank.name, rank.subtier) ?? getDeadlockRankIconUrl('Obscurus')
})

let refreshCleanup: (() => void) | null = null

async function loadStats(fresh = false) {
  loading.value = true
  fetchError.value = false
  try {
    const result = await window.api.deadlock.getStats({ fresh })
    stats.value = result.stats
    linked.value = result.linked
    fetchError.value = result.error === 'fetch_failed'
  } catch {
    stats.value = null
    linked.value = false
    fetchError.value = true
  } finally {
    loading.value = false
  }
}

let periodicRefresh: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  loadStats()
  refreshCleanup = window.api.on('dashboard:refresh', (...args: unknown[]) => {
    const payload = args[0] as { fresh?: boolean } | undefined
    loadStats(!!payload?.fresh)
  })
  periodicRefresh = setInterval(() => { loadStats(true) }, 3 * 60 * 1000)
})

onUnmounted(() => {
  refreshCleanup?.()
  if (periodicRefresh) clearInterval(periodicRefresh)
})

function heroColor(color: number[]): string {
  if (!color || color.length < 3) return 'rgba(20,184,166,0.2)'
  return `rgba(${color[0]},${color[1]},${color[2]},0.3)`
}

function heroInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function openWeb() {
  window.api.deadlock.openDashboard()
}

function openConnectSteam() {
  window.api.deadlock.openConnectSteam()
}

function matchDate(match: { start_time?: number }): string {
  return formatDeadlockMatchDate(match.start_time)
}

function fmtNW(n: number): string {
  return fmtDeadlockNW(n)
}

function fmtDuration(secs: number): string {
  return fmtDeadlockDuration(secs)
}
</script>
