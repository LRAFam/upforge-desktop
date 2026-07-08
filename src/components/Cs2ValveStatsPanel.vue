<template>
  <div class="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] overflow-hidden">
    <div class="flex items-center justify-between px-3.5 py-2.5 border-b border-blue-500/15">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 rounded-md flex items-center justify-center bg-blue-500/15">
          <svg class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
          </svg>
        </div>
        <span class="text-xs font-semibold text-gray-200">CS2 Stats</span>
      </div>
      <button
        class="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-all bg-blue-500/15 text-blue-300 border border-blue-500/25 hover:bg-blue-500/25"
        @click="openSettings"
      >
        Settings →
      </button>
    </div>

    <div v-if="loading" class="px-3.5 py-4 flex items-center gap-2">
      <div class="w-3 h-3 rounded-full border border-blue-500/30 border-t-blue-400 animate-spin" />
      <span class="text-xs text-gray-600">Loading CS2 profile…</span>
    </div>

    <div v-else-if="fetchError" class="px-3.5 py-4">
      <p class="text-xs text-amber-400/90">Couldn't load CS2 stats.</p>
      <button class="mt-2 text-[10px] font-semibold text-blue-300" @click="loadProfile">Retry</button>
    </div>

    <div v-else class="px-3.5 py-3 space-y-3">
      <div>
        <p class="text-[10px] uppercase tracking-wide text-gray-500">Steam name</p>
        <p class="text-sm font-bold text-white mt-0.5">
          {{ profile?.identity?.steam_display_name || 'Not set' }}
        </p>
        <p v-if="!profile?.identity?.linked" class="text-[10px] text-gray-500 mt-1 leading-relaxed">
          Set your in-game name so UpForge matches you in demo files.
        </p>
      </div>

      <div v-if="profile?.valve_stats?.matches_tracked" class="grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
          <p class="text-[9px] uppercase tracking-wide text-gray-500">Matches</p>
          <p class="text-lg font-black text-white tabular-nums">{{ profile.valve_stats.matches_tracked }}</p>
        </div>
        <div class="rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-2">
          <p class="text-[9px] uppercase tracking-wide text-gray-500">Avg K/D</p>
          <p class="text-lg font-black text-white tabular-nums">{{ profile.valve_stats.avg_kd ?? '—' }}</p>
        </div>
      </div>

      <div v-if="topMaps.length" class="space-y-1">
        <p class="text-[10px] uppercase tracking-wide text-gray-500">Top maps (UpForge)</p>
        <div
          v-for="row in topMaps"
          :key="row.map"
          class="flex items-center justify-between text-[11px] text-gray-400"
        >
          <span class="uppercase font-semibold text-gray-300">{{ row.map }}</span>
          <span class="tabular-nums">{{ row.matches }} matches</span>
        </div>
      </div>

      <p v-if="!profile?.valve_stats?.matches_tracked" class="text-[10px] text-gray-500 leading-relaxed">
        Record or analyse CS2 matches in UpForge to build map and K/D stats here. Premier rating sync is planned separately from FACEIT.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Cs2ProfilePayload } from '../lib/cs2'

const router = useRouter()
const loading = ref(true)
const fetchError = ref(false)
const profile = ref<Cs2ProfilePayload | null>(null)

const topMaps = computed(() => profile.value?.valve_stats?.map_breakdown?.slice(0, 4) ?? [])

let refreshCleanup: (() => void) | null = null

async function loadProfile() {
  loading.value = true
  fetchError.value = false
  try {
    profile.value = await window.api.cs2.getProfile()
  } catch {
    profile.value = null
    fetchError.value = true
  } finally {
    loading.value = false
  }
}

function openSettings() {
  router.push('/settings?tab=recording')
}

onMounted(() => {
  void loadProfile()
  refreshCleanup = window.api.on('dashboard:refresh', () => {
    void loadProfile()
  })
})

onUnmounted(() => {
  refreshCleanup?.()
})
</script>
